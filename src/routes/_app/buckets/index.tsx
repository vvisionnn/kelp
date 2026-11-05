import type { Bucket } from "@shared/objects.ts";
import type { BucketTraffic } from "@shared/telemetry.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Database } from "lucide-react";
import { useMemo } from "react";
import { compact, RANGES, Sparkline, useRange } from "@/components/kelp/charts/index.ts";
import { Segmented } from "@/components/kelp/controls.tsx";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import { BucketsDashboard } from "@/components/kelp/objects/bucket-dashboard.tsx";
import { BucketFlags } from "@/components/kelp/objects/bucket-flags.tsx";
import { CreateBucketDialog } from "@/components/kelp/objects/create-bucket.tsx";
import { trafficByBucket } from "@/components/kelp/objects/insights.ts";
import { CapacityBar, EmptyState, PageHeader } from "@/components/kelp/page.tsx";
import { formatBytes, formatCount, formatRelative } from "@/lib/format.ts";
import { objectQueries } from "@/lib/objects-queries.ts";
import { queries } from "@/lib/queries.ts";
import { useCanWrite } from "@/lib/session.ts";

export const Route = createFileRoute("/_app/buckets/")({
	staticData: { section: "Object store", title: "Buckets" },
	loader: ({ context }) => void context.queryClient.prefetchQuery(objectQueries.buckets()),
	component: BucketsPage,
});

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
	},
	{
		accessorKey: "createdAt",
		header: "Created",
		cell: ({ row }) => (
			<span className="text-[12px] text-muted-foreground">{formatRelative(row.original.createdAt)}</span>
		),
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
	};
}

function BucketsPage() {
	const { data, isPending, error, refetch } = useQuery(objectQueries.buckets());
	const [range, setRange] = useRange();
	const telemetry = useQuery(queries.telemetry(range)).data;
	const navigate = useNavigate();
	const canWrite = useCanWrite();
	const traffic = useMemo(() => trafficByBucket(telemetry), [telemetry]);
	const columns = useMemo(
		() =>
			telemetry?.enabled
				? [...bucketColumns.slice(0, 3), requestsColumn(traffic), ...bucketColumns.slice(3)]
				: bucketColumns,
		[telemetry?.enabled, traffic],
	);

	return (
		<>
			<PageHeader
				title="Buckets"
				description="S3 buckets, what they hold, how busy they are, and the rules they follow."
				actions={
					<>
						{telemetry?.enabled && (
							<Segmented label="Time range" items={RANGES} value={range} onChange={setRange} />
						)}
						{canWrite && <CreateBucketDialog />}
					</>
				}
			/>
			{data && data.length > 0 && <BucketsDashboard buckets={data} telemetry={telemetry} />}
			<DataTable
				data={data}
				isLoading={isPending}
				error={error}
				onRetry={() => refetch()}
				getRowId={(bucket) => bucket.name}
				searchText={(bucket) => `${bucket.name} ${bucket.owner}`}
				searchPlaceholder="Search buckets"
				onRowClick={(bucket) => navigate({ to: "/buckets/$bucket", params: { bucket: bucket.name } })}
				initialSorting={[{ id: "name", desc: false }]}
				columns={columns}
				empty={
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
				}
			/>
		</>
	);
}
