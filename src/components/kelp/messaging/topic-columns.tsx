import type { TopicSummary } from "@shared/messaging.ts";
import { TriangleAlert } from "lucide-react";
import type { Column } from "@/components/kelp/data-table.tsx";
import { cellGhost } from "@/components/kelp/maintenance/parts.tsx";
import { formatRetention } from "@/components/kelp/messaging/retention.tsx";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatBytes, formatCount, formatRelative } from "@/lib/format.ts";

/** One tick per partition (up to 24), so the table shows how finely each topic is split. */
function PartitionTicks({ count }: { count: number }) {
	const shown = Math.min(count, 24);
	return (
		<span className="flex items-center gap-2.5">
			<span className="tabular">{count}</span>
			<span className="flex h-3 items-center gap-[2px]" aria-hidden="true">
				{Array.from({ length: shown }, (_, i) => i).map((i) => (
					<span key={i} className="h-full w-[3px] rounded-full bg-[var(--data-3)]" />
				))}
			</span>
		</span>
	);
}

export const topicColumns: Array<Column<TopicSummary>> = [
	{
		accessorKey: "name",
		header: "Topic",
		cell: ({ row }) => (
			<div className="flex items-center gap-2">
				<span className="font-mono">
					<span className="text-muted-foreground">{row.original.namespace}.</span>
					{row.original.name}
				</span>
				{row.original.detailError && (
					<Tooltip>
						<TooltipTrigger
							render={<TriangleAlert className="size-3.5 text-warning" aria-label="Details unavailable" />}
						/>
						<TooltipContent>{row.original.detailError}</TooltipContent>
					</Tooltip>
				)}
			</div>
		),
		size: 260,
		meta: cellGhost("w-40"),
	},
	{
		accessorKey: "partitionCount",
		header: "Partitions",
		cell: ({ row }) => <PartitionTicks count={row.original.partitionCount} />,
		meta: cellGhost("w-16"),
	},
	{
		accessorKey: "messageCount",
		header: "Messages",
		cell: ({ row }) => <span className="tabular">{formatCount(row.original.messageCount)}</span>,
		meta: cellGhost("w-12"),
	},
	{
		accessorKey: "totalSize",
		header: "Size",
		cell: ({ row }) => <span className="tabular">{formatBytes(row.original.totalSize)}</span>,
		meta: cellGhost("w-14"),
	},
	{
		id: "retention",
		header: "Retention",
		cell: ({ row }) =>
			row.original.retention.enabled ? (
				formatRetention(row.original.retention)
			) : (
				<Badge variant="secondary">Keep forever</Badge>
			),
		meta: cellGhost("w-16"),
	},
	{
		accessorKey: "lastUpdated",
		header: "Updated",
		cell: ({ row }) => (
			<span className="text-muted-foreground">{formatRelative(row.original.lastUpdated)}</span>
		),
		meta: cellGhost("w-16"),
	},
];
