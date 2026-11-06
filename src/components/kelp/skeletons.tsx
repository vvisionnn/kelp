import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SkeletonBlock } from "./page.tsx";

/**
 * Loading shapes built on the same sheets, paddings and heights as the real thing, so content lands
 * exactly where its placeholder stood. Reuse the real `Panel` around a ghost whenever its title is known.
 */

/** Names what is loading for screen readers. Tests and people both read this label. */
export function LoadingRegion({
	label,
	children,
	className,
}: {
	label: string;
	children: ReactNode;
	className?: string;
}) {
	return (
		<div role="status" aria-busy="true" aria-label={label} className={className}>
			{children}
		</div>
	);
}

const repeat = (count: number, render: (i: number) => ReactNode) =>
	Array.from({ length: count }, (_, i) => render(i));

/** Matches `Kpi`. Set `trend={false}` for tiles without a sparkline. */
export function KpiGhost({ trend = true, className }: { trend?: boolean; className?: string }) {
	return (
		<div className={cn("group-sheet flex min-w-0 flex-col p-4", className)}>
			<SkeletonBlock className="my-0.5 h-3.5 w-20" />
			<SkeletonBlock className="mt-1.5 h-7 w-24" />
			<SkeletonBlock className="mt-1.5 h-3 w-28" />
			{trend && <SkeletonBlock className="mt-[18px] h-7 w-full" />}
		</div>
	);
}

/** Matches `StatBand`. */
export function StatBandGhost({ count = 4, className }: { count?: number; className?: string }) {
	return (
		<div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}>
			{repeat(count, (i) => (
				<div key={i} className="group-sheet px-4 py-3.5">
					<SkeletonBlock className="h-7 w-20" />
					<SkeletonBlock className="mt-1.5 h-3.5 w-24" />
				</div>
			))}
		</div>
	);
}

/** Matches a `TimeChart` of the same height, with gridlines so the plot reads as a plot. */
export function ChartGhost({ height = 200, legend = true }: { height?: number; legend?: boolean }) {
	return (
		<div>
			<div className="relative overflow-hidden" style={{ height }}>
				<div className="absolute inset-x-0 top-2 bottom-7 flex flex-col justify-between">
					{repeat(5, (i) => (
						<div key={i} className="border-border/60 border-t" />
					))}
				</div>
				<SkeletonBlock className="absolute inset-x-0 top-1/3 bottom-7 rounded-sm opacity-60" />
				<div className="absolute inset-x-8 bottom-0 flex justify-between">
					{repeat(4, (i) => (
						<SkeletonBlock key={i} className="h-3 w-12" />
					))}
				</div>
			</div>
			{legend && (
				<div className="flex h-12 items-start gap-4 pt-3">
					{repeat(3, (i) => (
						<SkeletonBlock key={i} className="h-3.5 w-12" />
					))}
				</div>
			)}
		</div>
	);
}

/** Matches a `Ring` beside or above its legend. */
export function RingGhost({ rows = 3 }: { rows?: number }) {
	return (
		<div className="flex flex-wrap items-center gap-6">
			<SkeletonBlock className="size-[168px] rounded-full" />
			<div className="w-full space-y-3.5">
				{repeat(rows, (i) => (
					<SkeletonBlock key={i} className="h-3.5 w-44" />
				))}
			</div>
		</div>
	);
}

/** Matches an `InfoList`, `BarList` or legend: a label and a value per row. */
export function RowsGhost({ rows = 4, className }: { rows?: number; className?: string }) {
	return (
		<div className={cn("space-y-3", className)}>
			{repeat(rows, (i) => (
				<div key={i} className="flex items-center justify-between gap-4">
					<SkeletonBlock className="h-3.5 w-1/3" />
					<SkeletonBlock className="h-3.5 w-16" />
				</div>
			))}
		</div>
	);
}

/** Matches a sheet of two-line rows with a trailing meter, such as a list of servers. */
export function ListGhost({ rows = 3, className }: { rows?: number; className?: string }) {
	return (
		<div className={cn("group-sheet divide-y divide-border", className)}>
			{repeat(rows, (i) => (
				<div key={i} className="flex items-center justify-between gap-6 px-4 py-3">
					<div className="min-w-0 flex-1 space-y-1.5">
						<SkeletonBlock className="h-4 w-2/5" />
						<SkeletonBlock className="h-3 w-3/5" />
					</div>
					<SkeletonBlock className="h-1.5 w-40 max-sm:hidden" />
				</div>
			))}
		</div>
	);
}
