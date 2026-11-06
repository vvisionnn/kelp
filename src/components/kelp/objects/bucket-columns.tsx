import type { Bucket } from "@shared/objects.ts";
import type { BucketTraffic } from "@shared/telemetry.ts";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { compact, Sparkline } from "@/components/kelp/charts/index.ts";
import type { Column } from "@/components/kelp/data-table.tsx";
import { BucketFlags } from "@/components/kelp/objects/bucket-flags.tsx";
import { CapacityBar, SkeletonBlock } from "@/components/kelp/page.tsx";
import { formatBytes, formatCount, formatRelative } from "@/lib/format.ts";

const ghostCell = (width: string): ReactNode => <SkeletonBlock className={`h-3.5 ${width}`} />;

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
		meta: {
			skeleton: (
				<div className="grid gap-1.5 py-0.5">
					<SkeletonBlock className="h-4 w-32" />
					<SkeletonBlock className="h-5 w-20" />
				</div>
			),
		},
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
		meta: { skeleton: ghostCell("w-20") },
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
		meta: { skeleton: ghostCell("w-10") },
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
		meta: { skeleton: ghostCell("w-24") },
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
		meta: { skeleton: ghostCell("w-20") },
	},
	{
		accessorKey: "createdAt",
		header: "Created",
		cell: ({ row }) => (
			<span className="text-[12px] text-muted-foreground">{formatRelative(row.original.createdAt)}</span>
		),
		meta: { skeleton: ghostCell("w-16") },
	},
];

/** The busiest-first requests column: requests in the range, with their shape over time. */
export function requestsColumn(traffic: Map<string, BucketTraffic>): Column<Bucket> {
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
		meta: { skeleton: ghostCell("w-20") },
	};
}
