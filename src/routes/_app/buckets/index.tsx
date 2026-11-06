import type { Bucket } from "@shared/objects.ts";
import type { BucketTraffic } from "@shared/telemetry.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Database } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { compact, RANGES, Sparkline, useRange } from "@/components/kelp/charts/index.ts";
import { Segmented } from "@/components/kelp/controls.tsx";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import { BucketsDashboard, BucketsDashboardGhost } from "@/components/kelp/objects/bucket-dashboard.tsx";
import { BucketFlags } from "@/components/kelp/objects/bucket-flags.tsx";
import { CreateBucketDialog } from "@/components/kelp/objects/create-bucket.tsx";
import { settledTelemetry, trafficByBucket } from "@/components/kelp/objects/insights.ts";
import { CapacityBar, EmptyState, PageHeader, SkeletonBlock } from "@/components/kelp/page.tsx";
import { LoadingRegion } from "@/components/kelp/skeletons.tsx";
import { Loaded, Swap } from "@/components/kelp/transitions.tsx";
import { formatBytes, formatCount, formatRelative } from "@/lib/format.ts";
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

const ghostCell = (width: string): ReactNode => <SkeletonBlock className={`h-3.5 ${width}`} />;

export const bucketColumns: Array<Column<Bucket>> = [
	{
		accessorKey: "name",
		header: "Bucket",
		cell: ({ row }) => (
			<div className="grid gap-1">
				<Link
					to="/buckets/$bucket"
					params={{ bucket: row.original.name }}
					className="w-fit font-medium font-mono text-[13px] hover:text-primary"
					onClick={(event) => event.stopPropagation()}
				>
					{row.original.name}
				</Link>
				<BucketFlags bucket={row.original} />
			</div>
		),
		meta: {
			skeleton: (
				<div className="grid gap-1.5 py-0.5">
					<SkeletonBlock className="h-4 w-32" />
					<SkeletonBlock className="h-5 w-20" />
				</div>
			),
		},
		size: 280,
	},
	{
		accessorKey: "logicalSize",
		header: "Data",
		cell: ({ row }) => (
			<div className="tabular">
				<p>{formatBytes(row.original.logicalSize)}</p>
				<p className="text-[12px] text-muted-foreground">{formatBytes(row.original.physicalSize)} on disk</p>
			</div>
		),
		meta: { skeleton: ghostCell("w-20") },
	},
	{
		id: "files",
		accessorFn: (bucket) => bucket.storedFiles ?? -1,
		header: "Files",
		cell: ({ row }) => (
			<span className="tabular">
				{row.original.storedFiles === null ? "—" : formatCount(row.original.storedFiles)}
			</span>
		),
		meta: { skeleton: ghostCell("w-10") },
	},
	{
		id: "quota",
		accessorFn: (bucket) => (bucket.quota.enabled ? bucket.logicalSize / bucket.quota.bytes : -1),
		header: "Quota",
		cell: ({ row }) =>
			row.original.quota.enabled ? (
				<div className="w-32">
					<CapacityBar used={row.original.logicalSize} total={row.original.quota.bytes} />
					<p className="mt-1 text-[12px] text-muted-foreground tabular">
						of {formatBytes(row.original.quota.bytes)}
					</p>
				</div>
			) : (
				<span className="text-muted-foreground">No limit</span>
			),
		meta: { skeleton: ghostCell("w-24") },
		size: 170,
	},
	{
		accessorKey: "owner",
		header: "Owner",
		cell: ({ row }) =>
			row.original.owner ? (
				<span className="font-mono text-[12px]">{row.original.owner}</span>
			) : (
				<span className="text-muted-foreground">Admins only</span>
			),
		meta: { skeleton: ghostCell("w-20") },
	},
	{
		accessorKey: "createdAt",
		header: "Created",
		cell: ({ row }) => (
			<span className="text-[12px] text-muted-foreground">{formatRelative(row.original.createdAt)}</span>
		),
		meta: { skeleton: ghostCell("w-16") },
	},
];

/** The busiest-first requests column: requests in the range, with their shape over time. */
function requestsColumn(traffic: Map<string, BucketTraffic>): Column<Bucket> {
	return {
		id: "requests",
		accessorFn: (bucket) => traffic.get(bucket.name)?.requests ?? 0,
		header: "Requests",
		cell: ({ row }) => {
			const t = traffic.get(row.original.name);
			if (!t || t.requests === 0) return <span className="text-tertiary">–</span>;
			return (
				<span className="flex items-center gap-2.5">
					<Sparkline values={t.series} width={56} height={18} label={`${row.original.name} requests`} />
					<span className="tabular">{compact(t.requests)}</span>
				</span>
			);
		},
		meta: { skeleton: ghostCell("w-20") },
	};
}

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
