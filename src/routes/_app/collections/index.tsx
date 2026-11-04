import type { StorageCollection } from "@shared/storage.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Layers } from "lucide-react";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import { AuroraCard, EmptyState, PageHeader, Reveal, SkeletonBlock } from "@/components/kelp/page.tsx";
import { GrowVolumesDialog } from "@/components/kelp/storage/cluster-actions.tsx";
import { CollectionShare } from "@/components/kelp/storage/collection-share.tsx";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatCount, formatPercent, ratio } from "@/lib/format.ts";
import { useCanWrite } from "@/lib/session.ts";
import { collectionLabel, collectionParam, storageQueries } from "@/lib/storage-queries.ts";

export const Route = createFileRoute("/_app/collections/")({
	staticData: { section: "Storage", title: "Collections" },
	loader: ({ context }) => void context.queryClient.prefetchQuery(storageQueries.inventory()),
	component: CollectionsPage,
});

export const collectionColumns: Array<Column<StorageCollection>> = [
	{
		accessorKey: "name",
		header: "Collection",
		cell: ({ row }) => (
			<Link
				to="/collections/$name"
				params={{ name: collectionParam(row.original.name) }}
				className={
					row.original.name ? "font-medium hover:underline" : "text-muted-foreground hover:underline"
				}
				onClick={(event) => event.stopPropagation()}
			>
				{collectionLabel(row.original.name)}
			</Link>
		),
	},
	{
		accessorKey: "size",
		header: "Size",
		cell: ({ row }) => <span className="tabular">{formatBytes(row.original.size)}</span>,
	},
	{
		accessorKey: "fileCount",
		header: "Files",
		cell: ({ row }) => <span className="tabular">{formatCount(row.original.fileCount)}</span>,
	},
	{
		accessorKey: "volumeCount",
		header: "Volumes",
		cell: ({ row }) => (
			<span className="tabular">
				{row.original.volumeCount}
				{row.original.ecVolumeCount > 0 && (
					<span className="text-muted-foreground"> + {row.original.ecVolumeCount} EC</span>
				)}
			</span>
		),
	},
	{
		id: "garbage",
		accessorFn: (c) => ratio(c.deletedBytes, c.size),
		header: "Garbage",
		cell: ({ row }) => (
			<span className="text-muted-foreground tabular">
				{row.original.deletedBytes > 0
					? formatPercent(ratio(row.original.deletedBytes, row.original.size))
					: "None"}
			</span>
		),
	},
	{
		id: "placement",
		header: "Placement",
		cell: ({ row }) => (
			<div className="flex flex-wrap items-center gap-1">
				{row.original.replications.map((r) => (
					<Badge key={r} variant="outline" className="font-mono">
						{r}
					</Badge>
				))}
				{row.original.diskTypes.map((d) => (
					<Badge key={d} variant="area">
						{d}
					</Badge>
				))}
				<span className="text-muted-foreground text-xs">
					{row.original.servers.length} {row.original.servers.length === 1 ? "server" : "servers"}
				</span>
			</div>
		),
		enableSorting: false,
	},
];

function CollectionsPage() {
	const canWrite = useCanWrite();
	const navigate = useNavigate();
	const { data, isPending, error, refetch } = useQuery(storageQueries.inventory());
	const total = data?.collections.reduce((sum, c) => sum + c.size, 0) ?? 0;
	const files = data?.collections.reduce((sum, c) => sum + c.fileCount, 0) ?? 0;
	return (
		<>
			<PageHeader
				title="Collections"
				description="Collections group volumes so their data can be sized, placed and deleted together. Every S3 bucket stores into its own collection."
				actions={canWrite && <GrowVolumesDialog inventory={data} />}
			/>
			{data ? (
				<Reveal>
					<AuroraCard className="p-7 sm:p-9">
						<div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
							<h2 className="text-[13px] text-foreground/70">Where the bytes are</h2>
							<p className="text-[13px] text-foreground/70">
								Stored bytes by collection, including erasure-coded data
							</p>
						</div>
						<p className="mt-10 flex flex-wrap items-baseline gap-x-3">
							<span className="font-[450] text-5xl leading-none tracking-[-0.04em]">
								{formatBytes(total)}
							</span>
							<span className="text-foreground/70">
								in {formatCount(data.collections.length)}{" "}
								{data.collections.length === 1 ? "collection" : "collections"}, {formatCount(files)} files
							</span>
						</p>
						<div className="mt-8">
							<CollectionShare collections={data.collections} />
						</div>
					</AuroraCard>
				</Reveal>
			) : (
				!error && <SkeletonBlock className="h-64 rounded-2xl" />
			)}
			<div className="mt-12">
				<DataTable
					data={data?.collections}
					columns={collectionColumns}
					getRowId={(c) => collectionParam(c.name)}
					isLoading={isPending}
					error={error}
					onRetry={() => refetch()}
					searchText={(c) => collectionLabel(c.name)}
					searchPlaceholder="Search collections"
					initialSorting={[{ id: "size", desc: true }]}
					onRowClick={(c) =>
						navigate({ to: "/collections/$name", params: { name: collectionParam(c.name) } })
					}
					empty={
						<EmptyState
							icon={<Layers />}
							title="No collections yet"
							description="A collection appears when its first volume is created, for example when you create a bucket."
						/>
					}
				/>
			</div>
		</>
	);
}
