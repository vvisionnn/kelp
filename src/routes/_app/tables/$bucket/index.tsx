import type { TableBucketDetail, TableNamespace, TableSummary } from "@shared/tables.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, FolderOpen, Table2, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/kelp/confirm-dialog.tsx";
import { CopyButton } from "@/components/kelp/copy-button.tsx";
import {
	AuroraCard,
	EmptyState,
	ErrorState,
	PageHeader,
	Panel,
	Reveal,
	SkeletonBlock,
	StatBand,
} from "@/components/kelp/page.tsx";
import { CreateNamespaceDialog, CreateTableDialog } from "@/components/kelp/tables/create-dialogs.tsx";
import { PolicyEditor } from "@/components/kelp/tables/policy-editor.tsx";
import { TagsEditor } from "@/components/kelp/tables/tags-editor.tsx";
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

/** Namespaces with their tables, including namespaces that have none yet. */
export function groupTables(namespaces: TableNamespace[], tables: TableSummary[]) {
	const groups = new Map<string, TableSummary[]>(namespaces.map((ns) => [ns.name, []]));
	for (const table of tables) groups.set(table.namespace, [...(groups.get(table.namespace) ?? []), table]);
	return [...groups]
		.map(([namespace, items]) => ({ namespace, tables: items.sort((a, b) => a.name.localeCompare(b.name)) }))
		.sort((a, b) => a.namespace.localeCompare(b.namespace));
}

function BucketPage() {
	const { bucket } = Route.useParams();
	const { data, isPending, error, refetch } = useQuery(streamsQueries.tableBucket(bucket));
	const canWrite = useCanWrite();
	return (
		<>
			<PageHeader
				title={bucket}
				description="Namespaces and the Iceberg tables in them, with the rules that guard them."
				actions={
					canWrite && data ? (
						<>
							<DeleteBucket bucket={bucket} empty={data.tables.length === 0} />
							<CreateNamespaceDialog bucket={bucket} />
							<CreateTableDialog bucket={bucket} namespaces={data.namespaces.map((n) => n.name)} />
						</>
					) : null
				}
			/>
			{isPending ? (
				<div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]" role="status" aria-label="Loading table bucket">
					<SkeletonBlock className="h-80 rounded-lg" />
					<SkeletonBlock className="h-80 rounded-2xl" />
				</div>
			) : error ? (
				<ErrorState error={error} onRetry={() => refetch()} />
			) : (
				<BucketBody detail={data} />
			)}
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
		<Reveal className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
			<div className="space-y-4">
				<StatBand
					className="mb-8"
					stats={[
						{ label: "Namespaces", value: detail.namespaces.length },
						{ label: "Tables", value: detail.tables.length },
						{
							label: "With data",
							value: detail.tables.filter((t) => t.metadataLocation).length,
							hint: "Tables an engine has written",
						},
					]}
				/>
				{groups.length === 0 ? (
					<EmptyState
						icon={<FolderOpen />}
						title="No namespaces yet"
						description="Create a namespace, then add tables to it. Engines can also create both through the catalog."
					/>
				) : (
					groups.map((group) => (
						<NamespaceSection
							key={group.namespace}
							bucket={name}
							namespace={group.namespace}
							tables={group.tables}
						/>
					))
				)}
			</div>
			<div className="space-y-4">
				<AuroraCard className="p-7">
					<span className="text-[13px] text-foreground/70">Warehouse</span>
					<p className="mt-8 flex items-center gap-1 break-all font-mono text-2xl tracking-tight">
						s3://{name}
						<CopyButton value={`s3://${name}`} label="Copy warehouse" />
					</p>
					<dl className="mt-6 grid grid-cols-[4rem_1fr] gap-y-1.5 text-[13px]">
						<dt className="text-foreground/65">Owner</dt>
						<dd>{detail.bucket.owner || "admin"}</dd>
						<dt className="text-foreground/65">ARN</dt>
						<dd className="break-all font-mono text-xs">{detail.bucket.arn}</dd>
					</dl>
				</AuroraCard>
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
		</Reveal>
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
		<section className="rounded-lg bg-card" aria-label={`Namespace ${namespace}`}>
			<header className="flex items-center justify-between gap-3 px-6 pt-5 pb-4 hairline-b">
				<h2 className="flex items-center gap-2.5 font-medium text-[15px]">
					<FolderOpen className="size-4 text-area" />
					<span className="font-mono">{namespace}</span>
					<span className="text-[13px] text-muted-foreground tabular">
						{tables.length} {tables.length === 1 ? "table" : "tables"}
					</span>
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
				<ul className="divide-y divide-hairline">
					{tables.map((table) => (
						<li key={table.arn}>
							<Link
								to="/tables/$bucket/$namespace/$table"
								params={{ bucket, namespace, table: table.name }}
								className="group flex items-center gap-3 px-6 py-3.5 text-sm transition-colors last:rounded-b-lg hover:bg-raised"
							>
								<Table2 className="size-4 text-area" />
								<span className="font-mono">{table.name}</span>
								{table.metadataLocation ? (
									<Badge variant="secondary">{table.format.toLowerCase()}</Badge>
								) : (
									<Badge variant="outline">schema only</Badge>
								)}
								<span className="ml-auto text-muted-foreground text-xs">
									Changed {formatRelative(table.modifiedAt)}
								</span>
								<ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
							</Link>
						</li>
					))}
				</ul>
			) : (
				<p className="px-6 py-5 text-muted-foreground text-sm">No tables in this namespace yet.</p>
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
				<Button variant="ghost" className="text-destructive">
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
