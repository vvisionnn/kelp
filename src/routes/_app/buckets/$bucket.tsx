import type { Bucket } from "@shared/objects.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { z } from "zod";
import { ConfirmDialog } from "@/components/kelp/confirm-dialog.tsx";
import { BucketFlags } from "@/components/kelp/objects/bucket-flags.tsx";
import { BucketSettings } from "@/components/kelp/objects/bucket-settings.tsx";
import { FileBrowser } from "@/components/kelp/objects/file-browser.tsx";
import { LifecycleEditor } from "@/components/kelp/objects/lifecycle-editor.tsx";
import { PolicyEditor } from "@/components/kelp/objects/policy-editor.tsx";
import {
	CapacityBar,
	ErrorState,
	InfoList,
	Metric,
	PageHeader,
	Reveal,
	SkeletonBlock,
} from "@/components/kelp/page.tsx";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBytes, formatCount, formatDateTime, formatPercent, ratio } from "@/lib/format.ts";
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
			<div role="status" aria-busy="true" aria-label="Loading bucket">
				<div className="flex items-center gap-3 pt-2 pb-6">
					<SkeletonBlock className="size-9 rounded-[9px]" />
					<SkeletonBlock className="h-7 w-48" />
				</div>
				<div className="grid gap-3 lg:grid-cols-12">
					<SkeletonBlock className="h-[124px] rounded-xl lg:col-span-4" />
					<SkeletonBlock className="h-[124px] rounded-xl lg:col-span-4" />
					<SkeletonBlock className="h-[124px] rounded-xl lg:col-span-4" />
				</div>
				<SkeletonBlock className="mt-6 h-80 rounded-xl" />
			</div>
		);
	}
	if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

	return (
		<>
			<PageHeader
				title={bucket.name}
				description={<BucketFlags bucket={bucket} />}
				actions={
					canWrite && (
						<ConfirmDialog
							trigger={
								<Button variant="destructive">
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
			<Reveal className="mb-8 grid gap-3 lg:grid-cols-12">
				<UsageWidget bucket={bucket} />
				<section className="group-sheet grid grid-cols-2 gap-x-4 gap-y-3 p-4 lg:col-span-4">
					<SmallStat label="On disk" value={formatBytes(bucket.physicalSize)} />
					<SmallStat
						label="Stored files"
						value={bucket.storedFiles === null ? "—" : formatCount(bucket.storedFiles)}
					/>
					<SmallStat label="Volumes" value={formatCount(bucket.volumes)} />
					<SmallStat
						label="Lifecycle rules"
						value={bucket.lifecycle.rules ? `${bucket.lifecycle.enabled} active` : "None"}
					/>
				</section>
				<InfoList
					className="lg:col-span-4"
					items={[
						{
							label: "Owner",
							value: bucket.owner ? (
								<span className="font-mono text-[12px]">{bucket.owner}</span>
							) : (
								<span className="text-muted-foreground">Admins only</span>
							),
						},
						{ label: "Created", value: formatDateTime(bucket.createdAt) },
						{
							label: "Address",
							value: <span className="font-mono text-[12px]">s3://{bucket.name}</span>,
						},
					]}
				/>
			</Reveal>
			<Tabs value={tab} onValueChange={(value) => navigate({ search: { tab: value as Tab } })}>
				<TabsList className="mb-4">
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

/** How full the bucket is against its quota, or simply how much it holds. */
function UsageWidget({ bucket }: { bucket: Bucket }) {
	const quota = bucket.quota.enabled;
	return (
		<section className="group-sheet flex flex-col p-4 lg:col-span-4">
			<p className="text-[13px] text-muted-foreground">{quota ? "Quota used" : "Object data"}</p>
			<p className="metric mt-1.5 font-semibold text-[28px] leading-8">
				{quota ? (
					<Metric value={ratio(bucket.logicalSize, bucket.quota.bytes)} format={formatPercent} />
				) : (
					<Metric value={bucket.logicalSize} format={formatBytes} />
				)}
			</p>
			{quota ? (
				<>
					<CapacityBar used={bucket.logicalSize} total={bucket.quota.bytes} className="mt-auto" />
					<p className="mt-1.5 text-[12px] text-muted-foreground tabular">
						{formatBytes(bucket.logicalSize)} of {formatBytes(bucket.quota.bytes)}
					</p>
				</>
			) : (
				<p className="mt-auto text-[12px] text-muted-foreground">No quota. Set one in Settings.</p>
			)}
		</section>
	);
}

function SmallStat({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0">
			<p className="text-[12px] text-muted-foreground">{label}</p>
			<p className="metric truncate font-semibold text-[20px] leading-6">{value}</p>
		</div>
	);
}
