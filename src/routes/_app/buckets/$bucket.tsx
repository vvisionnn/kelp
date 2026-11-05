import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { z } from "zod";
import { RANGES, useRange } from "@/components/kelp/charts/index.ts";
import { ConfirmDialog } from "@/components/kelp/confirm-dialog.tsx";
import { Segmented } from "@/components/kelp/controls.tsx";
import { BucketDashboard } from "@/components/kelp/objects/bucket-dashboard.tsx";
import { BucketFlags } from "@/components/kelp/objects/bucket-flags.tsx";
import { BucketSettings } from "@/components/kelp/objects/bucket-settings.tsx";
import { FileBrowser } from "@/components/kelp/objects/file-browser.tsx";
import { LifecycleEditor } from "@/components/kelp/objects/lifecycle-editor.tsx";
import { PolicyEditor } from "@/components/kelp/objects/policy-editor.tsx";
import { ErrorState, PageHeader, SkeletonBlock } from "@/components/kelp/page.tsx";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAction } from "@/lib/mutations.ts";
import { objectApi, objectKeys, objectQueries } from "@/lib/objects-queries.ts";
import { queries } from "@/lib/queries.ts";
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
	const [range, setRange] = useRange();
	const telemetry = useQuery(queries.telemetry(range)).data;
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
					<>
						{telemetry?.enabled && (
							<Segmented label="Time range" items={RANGES} value={range} onChange={setRange} />
						)}
						{canWrite && (
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
						)}
					</>
				}
			/>
			<BucketDashboard bucket={bucket} telemetry={telemetry} />
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
