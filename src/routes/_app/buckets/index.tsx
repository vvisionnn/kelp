import type { Bucket } from "@shared/objects.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Database } from "lucide-react";
import { useMemo } from "react";
import { RANGES, useRange } from "@/components/kelp/charts/index.ts";
import { Segmented } from "@/components/kelp/controls.tsx";
import { DataTable } from "@/components/kelp/data-table.tsx";
import { bucketColumns, requestsColumn } from "@/components/kelp/objects/bucket-columns.tsx";
import { BucketsDashboard, BucketsDashboardGhost } from "@/components/kelp/objects/bucket-dashboard.tsx";
import { CreateBucketDialog } from "@/components/kelp/objects/create-bucket.tsx";
import { settledTelemetry, trafficByBucket } from "@/components/kelp/objects/insights.ts";
import { EmptyState, PageHeader, SkeletonBlock } from "@/components/kelp/page.tsx";
import { LoadingRegion } from "@/components/kelp/skeletons.tsx";
import { Loaded, Swap } from "@/components/kelp/transitions.tsx";
import { objectQueries } from "@/lib/objects-queries.ts";
import { queries } from "@/lib/queries.ts";
import { useCanWrite } from "@/lib/session.ts";

export const Route = createFileRoute("/_app/buckets/")({
	staticData: { section: "Object store", title: "Buckets" },
	loader: ({ context }) => {
		void context.queryClient.prefetchQuery(objectQueries.buckets());
		void context.queryClient.prefetchQuery(queries.telemetry("1h"));
	},
	component: BucketsPage,
});

function BucketsPage() {
	const buckets = useQuery(objectQueries.buckets());
	const [range, setRange] = useRange();
	const metrics = useQuery(queries.telemetry(range));
	const telemetry = settledTelemetry(metrics);
	const navigate = useNavigate();
	const canWrite = useCanWrite();
	const traffic = useMemo(() => trafficByBucket(telemetry), [telemetry]);
	// While telemetry is on its way, the table holds the column it will most likely have.
	const live = telemetry === undefined || Boolean(telemetry?.enabled);
	const columns = useMemo(
		() =>
			live
				? [...bucketColumns.slice(0, 3), requestsColumn(traffic), ...bucketColumns.slice(3)]
				: bucketColumns,
		[live, traffic],
	);
	const table = {
		columns,
		getRowId: (bucket: Bucket) => bucket.name,
		onRowClick: (bucket: Bucket) => navigate({ to: "/buckets/$bucket", params: { bucket: bucket.name } }),
		initialSorting: [{ id: "name", desc: false }],
		empty: (
			<EmptyState
				icon={<Database />}
				title="No buckets yet"
				description={
					canWrite
						? "Create a bucket to start storing objects over S3."
						: "An administrator can create buckets for S3 clients."
				}
				action={canWrite && <CreateBucketDialog />}
			/>
		),
	};

	return (
		<>
			<PageHeader
				title="Buckets"
				description="S3 buckets, what they hold, how busy they are, and the rules they follow."
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
						{canWrite && <CreateBucketDialog />}
					</>
				}
			/>
			<Loaded
				query={{
					data: buckets.data && telemetry !== undefined ? { list: buckets.data, telemetry } : undefined,
					error: buckets.data ? null : buckets.error,
					refetch: buckets.refetch,
				}}
				skeleton={
					<LoadingRegion label="Loading buckets">
						<BucketsDashboardGhost />
						<div aria-hidden="true">
							<SkeletonBlock className="mb-3 h-8 w-full sm:w-64" />
							<DataTable {...table} data={undefined} isLoading />
						</div>
					</LoadingRegion>
				}
			>
				{({ list, telemetry: metricsNow }) => (
					<>
						{list.length > 0 && <BucketsDashboard buckets={list} telemetry={metricsNow} />}
						<DataTable
							{...table}
							data={list}
							searchText={(bucket) => `${bucket.name} ${bucket.owner}`}
							searchPlaceholder="Search buckets"
						/>
					</>
				)}
			</Loaded>
		</>
	);
}
