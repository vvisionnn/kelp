import type { Bucket } from "@shared/objects.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Database, FileStack, HardDrive } from "lucide-react";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import { BucketFlags } from "@/components/kelp/objects/bucket-flags.tsx";
import { CreateBucketDialog } from "@/components/kelp/objects/create-bucket.tsx";
import { CapacityBar, EmptyState, PageHeader, Reveal, StatTile } from "@/components/kelp/page.tsx";
import { formatBytes, formatCount, formatRelative } from "@/lib/format.ts";
import { objectQueries } from "@/lib/objects-queries.ts";
import { useCanWrite } from "@/lib/session.ts";

export const Route = createFileRoute("/_app/buckets/")({
	staticData: { section: "Object store", title: "Buckets" },
	loader: ({ context }) => context.queryClient.prefetchQuery(objectQueries.buckets()),
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
	const total = (data ?? []).reduce((sum, b) => sum + b.logicalSize, 0);
	const files = (data ?? []).reduce((sum, b) => sum + (b.storedFiles ?? 0), 0);

	return (
		<>
			<PageHeader
				title="Buckets"
				description="S3 buckets, what they hold, and the rules they follow."
				actions={canWrite && <CreateBucketDialog />}
			/>
			{data && data.length > 0 && (
				<Reveal className="mb-6 grid gap-4 sm:grid-cols-3">
					<StatTile label="Buckets" value={data.length} icon={<Database />} />
					<StatTile label="Object data" value={total} format={formatBytes} icon={<HardDrive />} />
					<StatTile
						label="Stored files"
						value={files}
						icon={<FileStack />}
						hint="Includes chunks of large objects"
					/>
				</Reveal>
			)}
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
