import type { TableBucketDetail, TableSummary } from "@shared/tables.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, FolderOpen, Table2, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/kelp/confirm-dialog.tsx";
import { CopyButton } from "@/components/kelp/copy-button.tsx";
import { EmptyState, PageHeader, Panel, SkeletonBlock } from "@/components/kelp/page.tsx";
import { LoadingRegion } from "@/components/kelp/skeletons.tsx";
import { CreateNamespaceDialog, CreateTableDialog } from "@/components/kelp/tables/create-dialogs.tsx";
import { groupTables } from "@/components/kelp/tables/insights.ts";
import { PolicyEditor } from "@/components/kelp/tables/policy-editor.tsx";
import { DashboardGhost, WarehouseDashboard } from "@/components/kelp/tables/table-insights.tsx";
import { TagsEditor } from "@/components/kelp/tables/tags-editor.tsx";
import { TextMorph } from "@/components/kelp/text-morph.tsx";
import { Loaded, Swap } from "@/components/kelp/transitions.tsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api.ts";
import { formatRelative } from "@/lib/format.ts";
import { useAction } from "@/lib/mutations.ts";
import { useCanWrite } from "@/lib/session.ts";
import { streamsQueries } from "@/lib/streams-queries.ts";

export const Route = createFileRoute("/_app/tables/$bucket/")({
	staticData: { section: "Object store", title: "Tables" },
	loader: ({ context, params }) => {
		// Prefetch without blocking: the page renders at once and its skeleton gives way to data.
		void context.queryClient.prefetchQuery(streamsQueries.tableBucket(params.bucket));
	},
	component: BucketPage,
});

function BucketPage() {
	const { bucket } = Route.useParams();
	const query = useQuery(streamsQueries.tableBucket(bucket));
	const { data, isPending } = query;
	const canWrite = useCanWrite();
	return (
		<>
			<PageHeader
				title={bucket}
				description="Namespaces and the Iceberg tables in them, with the rules that guard them."
				actions={
					canWrite && (
						<Swap id={data ? "actions" : isPending ? "loading" : "none"}>
							{data ? (
								<div className="flex flex-wrap items-center gap-2">
									<DeleteBucket bucket={bucket} empty={data.tables.length === 0} />
									<CreateNamespaceDialog bucket={bucket} />
									<CreateTableDialog bucket={bucket} namespaces={data.namespaces.map((n) => n.name)} />
								</div>
							) : (
								isPending && (
									<div className="flex flex-wrap items-center gap-2">
										<SkeletonBlock className="h-8 w-[132px]" />
										<SkeletonBlock className="h-8 w-[163px]" />
										<SkeletonBlock className="h-8 w-[122px]" />
									</div>
								)
							)}
						</Swap>
					)
				}
			/>
			<Loaded query={query} skeleton={<BucketSkeleton />}>
				{(detail) => <BucketBody detail={detail} />}
			</Loaded>
		</>
	);
}

function BucketBody({ detail }: { detail: TableBucketDetail }) {
	const canWrite = useCanWrite();
	const name = detail.bucket.name;
	const groups = groupTables(detail.namespaces, detail.tables);
	const invalidate = [["tables", "bucket", name]];
	const saveTags = useAction({
		run: (tags: Record<string, string>) =>
			api.put(`/tables/buckets/${encodeURIComponent(name)}/tags`, { tags }),
		success: "Tags saved",
		invalidate,
	});
	const savePolicy = useAction({
		run: (policy: string) => api.put(`/tables/buckets/${encodeURIComponent(name)}/policy`, { policy }),
		success: "Bucket policy saved",
		invalidate: [...invalidate, ["tables", "buckets"]],
	});
	const removePolicy = useAction({
		run: () => api.delete(`/tables/buckets/${encodeURIComponent(name)}/policy`),
		success: "Bucket policy removed",
		invalidate: [...invalidate, ["tables", "buckets"]],
	});

	return (
		<div className="grid items-start gap-x-6 gap-y-3 lg:grid-cols-12">
			<div className="space-y-3 lg:col-span-8">
				<WarehouseDashboard
					namespaces={detail.namespaces.length}
					tables={detail.tables.map((table) => ({ bucket: name, table }))}
				/>
				<Swap id={groups.length === 0 ? "empty" : "list"}>
					{groups.length === 0 ? (
						<EmptyState
							icon={<FolderOpen />}
							title="No namespaces yet"
							description="Create a namespace, then add tables to it. Engines can also create both through the catalog."
						/>
					) : (
						<div className="space-y-3">
							{groups.map((group) => (
								<NamespaceSection
									key={group.namespace}
									bucket={name}
									namespace={group.namespace}
									tables={group.tables}
								/>
							))}
						</div>
					)}
				</Swap>
			</div>
			<div className="space-y-3 lg:col-span-4">
				<section className="group-sheet p-4">
					<p className="text-[13px] text-muted-foreground">Warehouse</p>
					<p className="mt-1 flex items-center gap-1 break-all font-mono text-[15px]">
						s3://{name}
						<CopyButton value={`s3://${name}`} label="Copy warehouse" />
					</p>
					<dl className="mt-3 grid grid-cols-[3.5rem_1fr] gap-y-1.5 border-border border-t pt-3 text-[12px]">
						<dt className="text-muted-foreground">Owner</dt>
						<dd>{detail.bucket.owner || "admin"}</dd>
						<dt className="text-muted-foreground">ARN</dt>
						<dd className="break-all font-mono">{detail.bucket.arn}</dd>
					</dl>
				</section>
				<Panel title="Tags">
					<TagsEditor tags={detail.tags} canEdit={canWrite} onSave={(tags) => saveTags.mutateAsync(tags)} />
				</Panel>
				<Panel title="Bucket policy" description="Grants or denies access to every table in this bucket.">
					<PolicyEditor
						policy={detail.policy}
						resource={`${detail.bucket.arn}/*`}
						canEdit={canWrite}
						onSave={(policy) => savePolicy.mutateAsync(policy)}
						onRemove={() => removePolicy.mutateAsync()}
					/>
				</Panel>
			</div>
		</div>
	);
}

function NamespaceSection({
	bucket,
	namespace,
	tables,
}: {
	bucket: string;
	namespace: string;
	tables: TableSummary[];
}) {
	const canWrite = useCanWrite();
	const remove = useAction({
		run: () =>
			api.delete(`/tables/buckets/${encodeURIComponent(bucket)}/namespaces/${encodeURIComponent(namespace)}`),
		success: `Namespace ${namespace} deleted`,
		invalidate: [["tables", "bucket", bucket]],
	});
	return (
		<section className="group-sheet" aria-label={`Namespace ${namespace}`}>
			<header className="flex h-11 items-center justify-between gap-3 border-border border-b px-4">
				<h2 className="flex items-center gap-2 font-semibold text-[13px]">
					<FolderOpen className="size-4 text-muted-foreground" />
					<span className="font-mono">{namespace}</span>
					<TextMorph className="font-normal text-[12px] text-muted-foreground tabular">
						{`${tables.length} ${tables.length === 1 ? "table" : "tables"}`}
					</TextMorph>
				</h2>
				{canWrite && tables.length === 0 && (
					<ConfirmDialog
						trigger={
							<Button variant="ghost" size="icon-sm" aria-label={`Delete namespace ${namespace}`}>
								<Trash2 />
							</Button>
						}
						title={`Delete namespace ${namespace}?`}
						description="The namespace is empty, so nothing else is removed."
						confirmLabel="Delete namespace"
						destructive
						onConfirm={() => remove.mutateAsync()}
					/>
				)}
			</header>
			{tables.length ? (
				<ul className="divide-y divide-border">
					{tables.map((table) => (
						<li key={table.arn}>
							<Link
								to="/tables/$bucket/$namespace/$table"
								params={{ bucket, namespace, table: table.name }}
								className="group flex h-10 items-center gap-2.5 px-4 text-[13px] transition-colors hover:bg-raised/70"
							>
								<Table2 className="size-4 text-muted-foreground" />
								<span className="font-mono">{table.name}</span>
								{table.metadataLocation ? (
									<Badge variant="secondary">{table.format.toLowerCase()}</Badge>
								) : (
									<Badge variant="outline">schema only</Badge>
								)}
								<span className="ml-auto text-[12px] text-muted-foreground">
									Changed {formatRelative(table.modifiedAt)}
								</span>
								<ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
							</Link>
						</li>
					))}
				</ul>
			) : (
				<p className="px-4 py-3 text-[13px] text-muted-foreground">No tables in this namespace yet.</p>
			)}
		</section>
	);
}

function DeleteBucket({ bucket, empty }: { bucket: string; empty: boolean }) {
	const navigate = useNavigate();
	const remove = useAction({
		run: () => api.delete(`/tables/buckets/${encodeURIComponent(bucket)}`),
		success: `Table bucket ${bucket} deleted`,
		invalidate: [["tables", "buckets"]],
		onSuccess: () => navigate({ to: "/tables" }),
	});
	return (
		<ConfirmDialog
			trigger={
				<Button variant="destructive">
					<Trash2 />
					Delete bucket
				</Button>
			}
			title={`Delete table bucket ${bucket}?`}
			description={
				empty
					? "The bucket and its namespaces are removed. This cannot be undone."
					: "SeaweedFS refuses to delete a bucket that still has tables. Delete its tables first."
			}
			confirmLabel="Delete bucket"
			destructive
			typeToConfirm={bucket}
			onConfirm={() => remove.mutateAsync()}
		/>
	);
}

function BucketSkeleton() {
	return (
		<LoadingRegion label="Loading table bucket">
			<div className="grid items-start gap-x-6 gap-y-3 lg:grid-cols-12">
				<div className="space-y-3 lg:col-span-8">
					<DashboardGhost />
					<div className="space-y-3">
						{[0, 1, 2].map((group) => (
							<div key={group} className="group-sheet">
								<div className="flex h-11 items-center border-border border-b px-4">
									<SkeletonBlock className="h-3.5 w-32" />
								</div>
								<div className="flex h-10 items-center justify-between px-4">
									<SkeletonBlock className="h-3.5 w-40" />
									<SkeletonBlock className="h-3 w-28" />
								</div>
							</div>
						))}
					</div>
				</div>
				<div className="space-y-3 lg:col-span-4">
					<div className="group-sheet p-4">
						<SkeletonBlock className="my-0.5 h-3.5 w-20" />
						<SkeletonBlock className="mt-1.5 h-5 w-3/5" />
						<SkeletonBlock className="mt-3 h-[85px]" />
					</div>
					<Panel title="Tags">
						<SkeletonBlock className="h-[113px]" />
					</Panel>
					<Panel title="Bucket policy" description="Grants or denies access to every table in this bucket.">
						<SkeletonBlock className="h-[300px]" />
					</Panel>
				</div>
			</div>
		</LoadingRegion>
	);
}
