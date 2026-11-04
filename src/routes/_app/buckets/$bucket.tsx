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
import { Facts } from "@/components/kelp/objects/showcase.tsx";
import {
	AuroraCard,
	CapacityBar,
	ErrorState,
	PageHeader,
	Panel,
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
			<div className="grid gap-4 pt-6" role="status" aria-busy="true" aria-label="Loading bucket">
				<SkeletonBlock className="mt-6 h-12 w-72" />
				<div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
					<SkeletonBlock className="h-64 rounded-2xl" />
					<SkeletonBlock className="h-64 rounded-lg" />
				</div>
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
			<Reveal className="mb-12 grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
				<UsageCard bucket={bucket} />
				<Panel>
					<Facts
						items={[
							{ label: "On disk", value: formatBytes(bucket.physicalSize) },
							{
								label: "Stored files",
								value: bucket.storedFiles === null ? "—" : formatCount(bucket.storedFiles),
							},
							{ label: "Volumes", value: formatCount(bucket.volumes) },
							{ label: "Owner", value: bucket.owner || "Admins only", mono: Boolean(bucket.owner) },
							{ label: "Created", value: formatDateTime(bucket.createdAt) },
						]}
					/>
				</Panel>
			</Reveal>
			<Tabs value={tab} onValueChange={(value) => navigate({ search: { tab: value as Tab } })}>
				<TabsList className="mb-6">
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

/** The bucket's signature: how full it is against its quota, or simply how much it holds. */
function UsageCard({ bucket }: { bucket: Bucket }) {
	const quota = bucket.quota.enabled;
	return (
		<AuroraCard className="flex min-h-64 flex-col p-7 sm:p-8">
			<span className="text-[13px] text-foreground/70">{quota ? "Quota used" : "Object data"}</span>
			<div className="mt-auto pt-12">
				<p className="font-[450] text-5xl leading-none tracking-[-0.04em] sm:text-6xl">
					{quota
						? formatPercent(ratio(bucket.logicalSize, bucket.quota.bytes))
						: formatBytes(bucket.logicalSize)}
				</p>
				{quota ? (
					<>
						<CapacityBar
							used={bucket.logicalSize}
							total={bucket.quota.bytes}
							className="mt-6 h-2 bg-foreground/10"
						/>
						<p className="mt-3 text-[15px] text-foreground/75 tabular">
							{formatBytes(bucket.logicalSize)} of {formatBytes(bucket.quota.bytes)}
						</p>
					</>
				) : (
					<p className="mt-4 text-[15px] text-foreground/75">
						No quota. Set one in Settings to cap this bucket.
					</p>
				)}
			</div>
		</AuroraCard>
	);
}
