import type { StorageCollection } from "@shared/storage.ts";
import { Link } from "@tanstack/react-router";
import type { Column } from "@/components/kelp/data-table.tsx";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatCount, formatPercent, ratio } from "@/lib/format.ts";
import { collectionLabel, collectionParam } from "@/lib/storage-queries.ts";

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
				<span className="text-[12px] text-muted-foreground">
					{row.original.servers.length} {row.original.servers.length === 1 ? "server" : "servers"}
				</span>
			</div>
		),
		enableSorting: false,
	},
];
