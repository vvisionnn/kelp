import type { VolumeServer } from "@shared/api.ts";
import type { Column } from "@/components/kelp/data-table.tsx";
import { CapacityBar } from "@/components/kelp/page.tsx";
import { formatBytes, formatCount, formatRelative } from "@/lib/format.ts";

export const volumeServerColumns: Array<Column<VolumeServer>> = [
	{
		accessorKey: "address",
		header: "Address",
		cell: ({ row }) => (
			<div>
				<p className="font-mono">{row.original.address}</p>
				<p className="text-[12px] text-muted-foreground">
					{row.original.dataCenter} / {row.original.rack}
				</p>
			</div>
		),
		size: 220,
	},
	{
		accessorKey: "volumes",
		header: "Volumes",
		cell: ({ row }) => (
			<span className="tabular">
				{formatCount(row.original.volumes)} / {formatCount(row.original.maxVolumes)}
			</span>
		),
	},
	{
		accessorKey: "ecShards",
		header: "EC shards",
		cell: ({ row }) => <span className="tabular">{formatCount(row.original.ecShards)}</span>,
	},
	{
		id: "disk",
		accessorFn: (row) => row.diskUsage / (row.diskCapacity || 1),
		header: "Disk",
		cell: ({ row }) => (
			<div className="w-40">
				<CapacityBar used={row.original.diskUsage} total={row.original.diskCapacity} />
				<p className="mt-1 text-[12px] text-muted-foreground tabular">
					{formatBytes(row.original.diskUsage)} / {formatBytes(row.original.diskCapacity)}
				</p>
			</div>
		),
		size: 200,
	},
	{
		accessorKey: "version",
		header: "Version",
		cell: ({ row }) => (
			<span className="font-mono text-[12px]">{row.original.version.split(" ")[0] || "—"}</span>
		),
	},
	{
		accessorKey: "lastHeartbeat",
		header: "Heartbeat",
		cell: ({ row }) => (
			<span className="text-[12px] text-muted-foreground">{formatRelative(row.original.lastHeartbeat)}</span>
		),
	},
];
