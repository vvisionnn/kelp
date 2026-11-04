import type { Bucket } from "@shared/objects.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Database } from "lucide-react";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import { BucketFlags } from "@/components/kelp/objects/bucket-flags.tsx";
import { CreateBucketDialog } from "@/components/kelp/objects/create-bucket.tsx";
import { ShareBars, topShares } from "@/components/kelp/objects/showcase.tsx";
import {
	AuroraCard,
	CapacityBar,
	EmptyState,
	Metric,
	PageHeader,
	Panel,
	Reveal,
} from "@/components/kelp/page.tsx";
import { formatBytes, formatCount, formatRelative } from "@/lib/format.ts";
import { objectQueries } from "@/lib/objects-queries.ts";
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
					className="w-fit font-medium font-mono hover:underline"
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
				<p className="text-muted-foreground text-xs">{formatBytes(row.original.physicalSize)} on disk</p>
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
				<div className="w-36">
					<CapacityBar used={row.original.logicalSize} total={row.original.quota.bytes} />
					<p className="mt-1 text-muted-foreground text-xs tabular">
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
				<span className="font-mono text-xs">{row.original.owner}</span>
			) : (
				<span className="text-muted-foreground">Admins only</span>
			),
	},
	{
		accessorKey: "createdAt",
		header: "Created",
		cell: ({ row }) => (
			<span className="text-muted-foreground text-xs">{formatRelative(row.original.createdAt)}</span>
		),
	},
];

function BucketsPage() {
	const { data, isPending, error, refetch } = useQuery(objectQueries.buckets());
	const navigate = useNavigate();
	const canWrite = useCanWrite();

	return (
		<>
			<PageHeader
				title="Buckets"
				description="S3 buckets, what they hold, and the rules they follow."
				actions={canWrite && <CreateBucketDialog />}
			/>
			{data && data.length > 0 && <BucketsOverview buckets={data} />}
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
				columns={bucketColumns}
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

/** The total in the aurora, and beside it where that data actually lives. */
function BucketsOverview({ buckets }: { buckets: Bucket[] }) {
	const total = buckets.reduce((sum, b) => sum + b.logicalSize, 0);
	const files = buckets.reduce((sum, b) => sum + (b.storedFiles ?? 0), 0);
	const limited = buckets.filter((b) => b.quota.enabled).length;
	return (
		<Reveal className="mb-14 grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
			<AuroraCard className="flex min-h-64 flex-col p-7 sm:p-8">
				<span className="text-[13px] text-foreground/70">Object data</span>
				<div className="mt-auto pt-12">
					<p className="font-[450] text-5xl leading-none tracking-[-0.04em] sm:text-6xl">
						<Metric value={total} format={formatBytes} />
					</p>
					<p className="mt-4 text-[15px] text-foreground/75">
						In {formatCount(buckets.length)} {buckets.length === 1 ? "bucket" : "buckets"}, as{" "}
						{formatCount(files)} stored files.{" "}
						{limited > 0 ? `${limited} with a quota.` : "None has a quota."}
					</p>
				</div>
			</AuroraCard>
			<Panel title="Where it lives" description="Object data per bucket, largest first.">
				<ShareBars
					label="Object data per bucket"
					items={topShares(
						buckets.map((b) => ({ label: b.name, value: b.logicalSize })),
						6,
					)}
					format={formatBytes}
				/>
			</Panel>
		</Reveal>
	);
}
