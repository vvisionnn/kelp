import type { Bucket } from "@shared/objects.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Database } from "lucide-react";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import { BucketFlags } from "@/components/kelp/objects/bucket-flags.tsx";
import { CreateBucketDialog } from "@/components/kelp/objects/create-bucket.tsx";
import { ShareBars, topShares } from "@/components/kelp/objects/showcase.tsx";
import { CapacityBar, EmptyState, PageHeader, Panel, Reveal, StatBand } from "@/components/kelp/page.tsx";
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

/** Where the object data is: totals as widgets, and the largest buckets beside them. */
function BucketsOverview({ buckets }: { buckets: Bucket[] }) {
	const total = buckets.reduce((sum, b) => sum + b.logicalSize, 0);
	const onDisk = buckets.reduce((sum, b) => sum + b.physicalSize, 0);
	const files = buckets.reduce((sum, b) => sum + (b.storedFiles ?? 0), 0);
	const limited = buckets.filter((b) => b.quota.enabled).length;
	return (
		<Reveal className="mb-6 grid gap-3 lg:grid-cols-12">
			<StatBand
				className="lg:col-span-6 lg:grid-cols-2"
				stats={[
					{ label: "Object data", value: total, format: formatBytes },
					{
						label: "Buckets",
						value: buckets.length,
						hint: limited > 0 ? `${limited} with a quota` : "None has a quota",
					},
					{ label: "Stored files", value: files },
					{ label: "On disk", value: onDisk, format: formatBytes, hint: "With copies" },
				]}
			/>
			<Panel title="Largest buckets" description="Object data per bucket" className="lg:col-span-6">
				<ShareBars
					label="Object data per bucket"
					items={topShares(
						buckets.map((b) => ({ label: b.name, value: b.logicalSize })),
						5,
					)}
					format={formatBytes}
				/>
			</Panel>
		</Reveal>
	);
}
