import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Trash2 } from "lucide-react";
import { z } from "zod";
import { ConfirmDialog } from "@/components/kelp/confirm-dialog.tsx";
import { BucketFlags } from "@/components/kelp/objects/bucket-flags.tsx";
import { BucketSettings } from "@/components/kelp/objects/bucket-settings.tsx";
import { FileBrowser } from "@/components/kelp/objects/file-browser.tsx";
import { LifecycleEditor } from "@/components/kelp/objects/lifecycle-editor.tsx";
import { PolicyEditor } from "@/components/kelp/objects/policy-editor.tsx";
import { CapacityBar, ErrorState, PageHeader, Reveal, SkeletonBlock } from "@/components/kelp/page.tsx";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBytes, formatCount, formatDateTime } from "@/lib/format.ts";
import { useAction } from "@/lib/mutations.ts";
import { objectApi, objectKeys, objectQueries } from "@/lib/objects-queries.ts";
import { useCanWrite } from "@/lib/session.ts";

const TABS = ["objects", "settings", "lifecycle", "policy"] as const;
type Tab = (typeof TABS)[number];

export const Route = createFileRoute("/_app/buckets/$bucket")({
	staticData: { section: "Object store", title: "Buckets" },
	validateSearch: z.object({ tab: z.enum(TABS).optional(), path: z.string().optional() }),
	loader: ({ context, params }) =>
		void context.queryClient.prefetchQuery(objectQueries.bucket(params.bucket)),
	component: BucketPage,
});

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="grid gap-0.5">
			<dt className="text-muted-foreground text-xs">{label}</dt>
			<dd className="font-medium tabular">{children}</dd>
		</div>
	);
}

function BucketPage() {
	const { bucket: name } = Route.useParams();
	const { tab = "objects", path } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const canWrite = useCanWrite();
	const { data: bucket, isPending, error, refetch } = useQuery(objectQueries.bucket(name));
	const root = `/buckets/${name}`;
	const current = path?.startsWith(`${root}/`) ? path : root;

	const remove = useAction({
		run: () => objectApi.deleteBucket(name),
		success: `Bucket ${name} deleted`,
		invalidate: [objectKeys.buckets],
		onSuccess: () => navigate({ to: "/buckets" }),
	});

	if (isPending) {
		return (
			<div className="grid gap-4" role="status" aria-busy="true" aria-label="Loading bucket">
				<SkeletonBlock className="mt-2 h-8 w-56" />
				<SkeletonBlock className="h-20 rounded-xl" />
				<SkeletonBlock className="h-80 rounded-xl" />
			</div>
		);
	}
	if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

	return (
		<>
			<Link
				to="/buckets"
				className="mt-2 inline-flex w-fit items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
			>
				<ArrowLeft className="size-3.5" />
				Buckets
			</Link>
			<PageHeader
				title={bucket.name}
				description={<BucketFlags bucket={bucket} />}
				actions={
					canWrite && (
						<ConfirmDialog
							trigger={
								<Button variant="ghost" className="text-destructive">
									<Trash2 />
									Delete bucket
								</Button>
							}
							title={`Delete bucket ${bucket.name}?`}
							description="Every object and version in the bucket is deleted, and S3 clients lose access. This cannot be undone."
							confirmLabel="Delete bucket"
							destructive
							typeToConfirm={bucket.name}
							onConfirm={() => remove.mutateAsync()}
						/>
					)
				}
			/>
			<Reveal>
				<dl className="mb-6 grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border bg-card px-5 py-4 sm:grid-cols-3 lg:grid-cols-5">
					<Stat label="Object data">{formatBytes(bucket.logicalSize)}</Stat>
					<Stat label="On disk">{formatBytes(bucket.physicalSize)}</Stat>
					<Stat label="Stored files">
						{bucket.storedFiles === null ? "—" : formatCount(bucket.storedFiles)}
					</Stat>
					<Stat label="Volumes">{formatCount(bucket.volumes)}</Stat>
					<Stat label="Created">
						<span className="font-normal text-sm">{formatDateTime(bucket.createdAt)}</span>
					</Stat>
					{bucket.quota.enabled && (
						<div className="col-span-full grid gap-1.5">
							<div className="flex justify-between text-xs">
								<span className="text-muted-foreground">Quota</span>
								<span className="tabular">
									{formatBytes(bucket.logicalSize)} of {formatBytes(bucket.quota.bytes)}
								</span>
							</div>
							<CapacityBar used={bucket.logicalSize} total={bucket.quota.bytes} />
						</div>
					)}
				</dl>
			</Reveal>
			<Tabs value={tab} onValueChange={(value) => navigate({ search: { tab: value as Tab } })}>
				<TabsList variant="line" className="mb-4">
					<TabsTrigger value="objects">Objects</TabsTrigger>
					<TabsTrigger value="settings">Settings</TabsTrigger>
					<TabsTrigger value="lifecycle">Lifecycle</TabsTrigger>
					<TabsTrigger value="policy">Policy</TabsTrigger>
				</TabsList>
				<TabsContent value="objects">
					<FileBrowser
						root={root}
						rootLabel={bucket.name}
						path={current}
						onNavigate={(next) =>
							navigate({ search: { tab: "objects", ...(next === root ? {} : { path: next }) } })
						}
					/>
				</TabsContent>
				<TabsContent value="settings">
					<BucketSettings bucket={bucket} />
				</TabsContent>
				<TabsContent value="lifecycle">
					<LifecycleEditor bucket={bucket.name} />
				</TabsContent>
				<TabsContent value="policy">
					<PolicyEditor bucket={bucket.name} />
				</TabsContent>
			</Tabs>
		</>
	);
}
