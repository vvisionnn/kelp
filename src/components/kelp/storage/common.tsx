import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import type { Column } from "@/components/kelp/data-table.tsx";
import { EASE, SPEED, usePrefersReducedMotion } from "@/components/kelp/motion.ts";
import { SkeletonBlock } from "@/components/kelp/page.tsx";
import { ChartGhost, KpiGhost } from "@/components/kelp/skeletons.tsx";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const repeat = (count: number, render: (i: number) => ReactNode) =>
	Array.from({ length: count }, (_, i) => render(i));

/** A header description still loading: one line, or two where the sentence wraps on a phone. */
export function DescriptionGhost({ width = "w-96", wraps = false }: { width?: string; wraps?: boolean }) {
	return (
		<div className="max-w-full">
			<div className="flex h-[18px] items-center">
				<SkeletonBlock className={`h-3.5 max-w-full ${width}`} />
			</div>
			{wraps && (
				<div className="flex h-[18px] items-center sm:hidden">
					<SkeletonBlock className="h-3.5 w-3/5" />
				</div>
			)}
		</div>
	);
}

/** The storage pages' row of six `Kpi` tiles. Phones hide the sparklines, as the tiles do. */
export function KpiRowGhost({ trend = true }: { trend?: boolean }) {
	return (
		<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
			{repeat(6, (i) => (
				<KpiGhost
					key={i}
					trend={trend}
					className={trend ? "pb-[17px] max-sm:pb-8 max-sm:[&>:last-child]:hidden" : "pb-[27px] max-sm:pb-6"}
				/>
			))}
		</div>
	);
}

/** Matches a `StatBand`, with or without the hint line under each label. */
export function StatsGhost({
	count = 4,
	hint = true,
	className,
}: {
	count?: number;
	hint?: boolean;
	className?: string;
}) {
	return (
		<div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}>
			{repeat(count, (i) => (
				<div key={i} className="group-sheet px-4 py-3.5">
					<div className="flex h-8 items-center">
						<SkeletonBlock className="h-7 w-20" />
					</div>
					<div className="flex h-5 items-center">
						<SkeletonBlock className="h-3.5 w-24" />
					</div>
					{hint && (
						<div className="mt-0.5 flex h-5 items-center">
							<SkeletonBlock className="h-3 w-28" />
						</div>
					)}
				</div>
			))}
		</div>
	);
}

/** Matches a `TimeChart` of the same height with its one-line series legend. */
export function PlotGhost({ height }: { height: number }) {
	return (
		<div>
			<ChartGhost height={height} legend={false} />
			<div className="mt-2 flex h-5 items-center gap-4 pl-11">
				{repeat(3, (i) => (
					<SkeletonBlock key={i} className="h-3 w-12" />
				))}
			</div>
		</div>
	);
}

const COLUMN_HEIGHTS = [70, 35, 50, 20, 60, 30, 45, 15, 25, 40];

/** Matches `Columns`: bars standing on the same baseline, with room for their labels. */
export function ColumnsGhost({ height, count = 10 }: { height: number; count?: number }) {
	return (
		<div className="relative" style={{ height }}>
			<div className="absolute inset-x-0 top-[18px] bottom-5 flex items-end justify-around border-border border-b">
				{repeat(count, (i) => (
					<Skeleton
						key={i}
						className="w-[min(24px,6%)] rounded-t-[4px] rounded-b-none"
						// A fixed profile, so the ghost reads as a distribution rather than a solid block.
						style={{ height: `${COLUMN_HEIGHTS[i % COLUMN_HEIGHTS.length]}%` }}
					/>
				))}
			</div>
		</div>
	);
}

/** Matches a `Ring` of any size with its legend beside it. */
export function RingLegendGhost({
	size,
	thickness = 14,
	rows,
	legendClassName,
}: {
	size: number;
	thickness?: number;
	rows: number;
	/** For a panel whose real legend is wide enough to wrap under the ring. */
	legendClassName?: string;
}) {
	const hole = size / 2 - thickness;
	return (
		<div className="flex flex-wrap items-center gap-6">
			<div className="shrink-0" style={{ width: size, height: size }}>
				<Skeleton
					className="size-full rounded-full"
					style={{ mask: `radial-gradient(circle, transparent ${hole}px, black ${hole + 0.5}px)` }}
				/>
			</div>
			<div className={cn("flex flex-col items-start gap-y-2", legendClassName)}>
				{repeat(rows, (i) => (
					<SkeletonBlock key={i} className="my-1 h-3 w-36" />
				))}
			</div>
		</div>
	);
}

/** Matches a `BarList`: a label, a thin bar and the value at its tip. */
export function BarsGhost({ rows }: { rows: number }) {
	return (
		<div className="space-y-2.5">
			{repeat(rows, (i) => (
				<div key={i} className="grid h-5 grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3">
					<SkeletonBlock className="h-3.5 w-3/4" />
					<SkeletonBlock className="h-1.5" />
					<SkeletonBlock className="h-3.5 w-14" />
				</div>
			))}
		</div>
	);
}

/** Real controls drawn as a placeholder, such as a table in its loading state: seen, not yet reachable. */
export function Frozen({ children }: { children: ReactNode }) {
	return (
		<div inert aria-hidden="true">
			{children}
		</div>
	);
}

/** Gives a table's loading rows a ghost in every cell, as tall as the real cell content. */
export function ghostCells<T extends object>(columns: Array<Column<T>>, height = 20): Array<Column<T>> {
	return columns.map((column) =>
		Object.assign({}, column, {
			meta: {
				...column.meta,
				skeleton: (
					<div className="flex items-center" style={{ height }}>
						<SkeletonBlock className="h-3.5 w-3/5" />
					</div>
				),
			},
		}),
	);
}

/** Where a table search box lands. A ghost, not the input, so nothing can type into a placeholder. */
export function SearchGhost() {
	return <SkeletonBlock className="mr-auto h-8 w-full sm:w-64" />;
}

/** A value inside a real `InfoList`, so the labels stand still while the facts load. */
export function ValueGhost({ width = "w-20" }: { width?: string }) {
	return <SkeletonBlock className={`ml-auto h-3.5 ${width}`} />;
}

/** An inline block that opens and closes instead of snapping, such as a field error or an alert. */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
	const reduced = usePrefersReducedMotion();
	return (
		<AnimatePresence initial={false}>
			{open && (
				<motion.div
					className="overflow-hidden"
					initial={{ height: 0, opacity: 0 }}
					animate={{ height: "auto", opacity: 1 }}
					exit={{ height: 0, opacity: 0 }}
					transition={{ duration: reduced ? 0 : SPEED.base, ease: EASE }}
				>
					{children}
				</motion.div>
			)}
		</AnimatePresence>
	);
}

/** A featured sheet's caption row: what it shows on the left, how to read it on the right. */
export function SheetCaption({ title, children }: { title: ReactNode; children?: ReactNode }) {
	return (
		<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
			<h2 className="font-semibold text-[13px]">{title}</h2>
			{children && <p className="text-[12px] text-muted-foreground">{children}</p>}
		</div>
	);
}
