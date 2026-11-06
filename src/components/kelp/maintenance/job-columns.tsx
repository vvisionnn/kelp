import type { MaintenanceJob } from "@shared/maintenance.ts";
import { Link } from "@tanstack/react-router";
import type { Column } from "@/components/kelp/data-table.tsx";
import { cellGhost, humanize, JobStateBadge, twoLineGhost } from "@/components/kelp/maintenance/parts.tsx";
import { formatRelative } from "@/lib/format.ts";

export const jobColumns: Array<Column<MaintenanceJob>> = [
	{
		accessorKey: "summary",
		header: "Job",
		cell: ({ row }) => (
			<div className="min-w-0">
				<Link
					to="/maintenance/jobs/$jobId"
					params={{ jobId: row.original.id }}
					className="font-medium hover:text-primary"
				>
					{row.original.summary || humanize(row.original.jobType)}
				</Link>
				<p className="truncate text-[12px] text-muted-foreground">
					{row.original.message || row.original.resultSummary}
				</p>
			</div>
		),
		size: 320,
		meta: twoLineGhost,
	},
	{
		accessorKey: "state",
		header: "State",
		cell: ({ row }) => <JobStateBadge state={row.original.state} progress={row.original.progress} />,
		meta: cellGhost("w-20"),
	},
	{
		accessorKey: "attempt",
		header: "Attempt",
		cell: ({ row }) => <span className="tabular">{row.original.attempt || 1}</span>,
		meta: cellGhost("w-6"),
	},
	{
		accessorKey: "createdAt",
		header: "Created",
		cell: ({ row }) => (
			<span className="text-muted-foreground text-xs">{formatRelative(row.original.createdAt)}</span>
		),
		meta: cellGhost("w-16"),
	},
	{
		accessorKey: "completedAt",
		header: "Finished",
		cell: ({ row }) => (
			<span className="text-muted-foreground text-xs">{formatRelative(row.original.completedAt)}</span>
		),
		meta: cellGhost("w-16"),
	},
];
