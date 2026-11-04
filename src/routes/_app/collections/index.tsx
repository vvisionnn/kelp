import type { StorageCollection } from "@shared/storage.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Layers } from "lucide-react";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import { EmptyState, PageHeader, Panel, Reveal, SkeletonBlock } from "@/components/kelp/page.tsx";
import { GrowVolumesDialog } from "@/components/kelp/storage/cluster-actions.tsx";
import { CollectionShare } from "@/components/kelp/storage/collection-share.tsx";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatCount, formatPercent, ratio } from "@/lib/format.ts";
import { useCanWrite } from "@/lib/session.ts";
import { collectionLabel, collectionParam, storageQueries } from "@/lib/storage-queries.ts";

export const Route = createFileRoute("/_app/collections/")({
	staticData: { section: "Storage", title: "Collections" },
	loader: ({ context }) => context.queryClient.prefetchQuery(storageQueries.inventory()),
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
					<Badge key={d} variant="secondary">
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
	return (
		<>
			<PageHeader
				title="Collections"
				description="Collections group volumes so their data can be sized, placed and deleted together. Every S3 bucket stores into its own collection."
				actions={canWrite && <GrowVolumesDialog inventory={data} />}
			/>
			<Reveal>
				<Panel
					title="Where the bytes are"
					description="Stored bytes by collection, including erasure-coded data."
				>
					{data ? <CollectionShare collections={data.collections} /> : <SkeletonBlock className="h-10" />}
				</Panel>
			</Reveal>
			<div className="mt-6">
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
