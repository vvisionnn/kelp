import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { z } from "zod";
import { RANGES, useRange } from "@/components/kelp/charts/index.ts";
import { ConfirmDialog } from "@/components/kelp/confirm-dialog.tsx";
import { Segmented } from "@/components/kelp/controls.tsx";
import { BucketDashboard, BucketDashboardGhost } from "@/components/kelp/objects/bucket-dashboard.tsx";
import { BucketFlags } from "@/components/kelp/objects/bucket-flags.tsx";
import { BucketSettings, BucketSettingsGhost } from "@/components/kelp/objects/bucket-settings.tsx";
import { FileBrowser } from "@/components/kelp/objects/file-browser.tsx";
import { settledTelemetry } from "@/components/kelp/objects/insights.ts";
import { LifecycleEditor } from "@/components/kelp/objects/lifecycle-editor.tsx";
import { PolicyEditor } from "@/components/kelp/objects/policy-editor.tsx";
import { PageHeader, SkeletonBlock } from "@/components/kelp/page.tsx";
import { Loaded, Swap } from "@/components/kelp/transitions.tsx";
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
	const details = useQuery(objectQueries.bucket(name));
	const bucket = details.data;
	const [range, setRange] = useRange();
	const telemetry = settledTelemetry(useQuery(queries.telemetry(range)));
	const failed = !bucket && Boolean(details.error);
	const root = `/buckets/${name}`;
	const current = path?.startsWith(`${root}/`) ? path : root;

	const remove = useAction({
		run: () => objectApi.deleteBucket(name),
		success: `Bucket ${name} deleted`,
		invalidate: [objectKeys.buckets],
		onSuccess: () => navigate({ to: "/buckets" }),
	});

	return (
		<>
			<PageHeader
				title={name}
				description={
					<Swap id={bucket ? "flags" : "pending"} className="min-h-5">
						{bucket ? (
							<BucketFlags bucket={bucket} />
						) : (
							!failed && <SkeletonBlock className="kelp-skeleton-in h-5 w-40" />
						)}
					</Swap>
				}
				actions={
					<>
						<Swap id={telemetry === undefined ? "pending" : telemetry?.enabled ? "ranges" : "none"}>
							{telemetry === undefined ? (
								<SkeletonBlock className="kelp-skeleton-in h-8 w-40" />
							) : (
								telemetry?.enabled && (
									<Segmented label="Time range" items={RANGES} value={range} onChange={setRange} />
								)
							)}
						</Swap>
						{canWrite && !failed && (
							<ConfirmDialog
								trigger={
									<Button variant="destructive" disabled={!bucket}>
										<Trash2 />
										Delete bucket
									</Button>
								}
								title={`Delete bucket ${name}?`}
								description="Every object and version in the bucket is deleted, and S3 clients lose access. This cannot be undone."
								confirmLabel="Delete bucket"
								destructive
								typeToConfirm={name}
								onConfirm={() => remove.mutateAsync()}
							/>
						)}
					</>
				}
			/>
			<Loaded
				query={{
					data: bucket && telemetry !== undefined ? { bucket, telemetry } : undefined,
					error: bucket ? null : details.error,
					refetch: details.refetch,
				}}
				skeleton={<BucketDashboardGhost />}
			>
				{(ready) => <BucketDashboard bucket={ready.bucket} telemetry={ready.telemetry} />}
			</Loaded>
			<Swap id={failed ? "failed" : "tabs"}>
				{!failed && (
					<Tabs value={tab} onValueChange={(value) => navigate({ search: { tab: value as Tab } })}>
						<TabsList className="mb-4">
							<TabsTrigger value="objects">Objects</TabsTrigger>
							<TabsTrigger value="settings">Settings</TabsTrigger>
							<TabsTrigger value="lifecycle">Lifecycle</TabsTrigger>
							<TabsTrigger value="policy">Policy</TabsTrigger>
						</TabsList>
						{/* One panel whose content crossfades; the outgoing tab stays until the new one is in. */}
						<TabsContent value={tab}>
							<Swap id={tab}>
								{tab === "objects" ? (
									<FileBrowser
										root={root}
										rootLabel={name}
										path={current}
										ready={Boolean(bucket)}
										onNavigate={(next) =>
											navigate({ search: { tab: "objects", ...(next === root ? {} : { path: next }) } })
										}
									/>
								) : tab === "settings" ? (
									<Loaded query={{ data: bucket, error: null }} skeleton={<BucketSettingsGhost />}>
										{(loaded) => <BucketSettings bucket={loaded} />}
									</Loaded>
								) : tab === "lifecycle" ? (
									<LifecycleEditor
										bucket={name}
										ready={Boolean(bucket)}
										ruleCount={bucket?.lifecycle.rules}
									/>
								) : (
									<PolicyEditor bucket={name} ready={Boolean(bucket)} />
								)}
							</Swap>
						</TabsContent>
					</Tabs>
				)}
			</Swap>
		</>
	);
}
