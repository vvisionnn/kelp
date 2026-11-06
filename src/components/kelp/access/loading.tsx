import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { EASE, SPEED, usePrefersReducedMotion } from "../motion.ts";
import { SkeletonBlock } from "../page.tsx";
import { KpiGhost } from "../skeletons.tsx";

/**
 * Loading shapes for the access pages, built on the same sheets and heights as what lands on them,
 * plus the two small transitions these pages need beyond `Swap`.
 */

const repeat = (count: number, render: (i: number) => ReactNode) =>
	Array.from({ length: count }, (_, i) => render(i));

/** Keeps a header action on its own row on phones, whatever the width of the text beside it. */
export const HEADER_ACTION = "max-sm:w-[calc(100vw-4rem)]";

/** For a query the view can do without: answers `fallback` once it has failed, and waits until then. */
export function optional<T>(query: { data: T | undefined; error: unknown }, fallback: T) {
	return { data: query.data ?? (query.error ? fallback : undefined), error: null };
}

/**
 * Holds `query` back until `others` have answered, so a detail page lands in one step instead of
 * its ghosts swapping out a moment apart. Whatever they answered is still theirs to show. Once
 * landed it stays landed: a failed query retries when the page's own observers mount, and letting
 * that hold the page back again would unmount them and retry forever.
 */
export function useLanding<T>(
	query: { data: T | undefined; error: unknown; refetch: () => unknown },
	...others: Array<{ isPending: boolean }>
) {
	const { data, error, refetch } = query;
	const landed = useRef(false);
	if (data !== undefined && !others.some((other) => other.isPending)) landed.current = true;
	return { data: landed.current ? data : undefined, error, refetch };
}

/** A block that opens and closes by height, for forms and inline sections that come and go. */
export function Expand({
	open,
	children,
	className,
}: {
	open: boolean;
	children: ReactNode;
	className?: string;
}) {
	const reduced = usePrefersReducedMotion();
	return (
		<AnimatePresence initial={false}>
			{open && (
				<motion.div
					className={cn("min-w-0", className)}
					initial={reduced ? false : { height: 0, opacity: 0, overflow: "hidden" }}
					// `overflow` comes back afterwards so focus rings are not clipped.
					animate={{ height: "auto", opacity: 1, transitionEnd: { overflow: "visible" } }}
					exit={{
						height: 0,
						opacity: 0,
						overflow: "hidden",
						...(reduced ? { transition: { duration: 0 } } : {}),
					}}
					transition={{ duration: SPEED.base, ease: EASE }}
				>
					{children}
				</motion.div>
			)}
		</AnimatePresence>
	);
}

/** Prose that can wrap fades when it changes, where `TextMorph` would hold it on one line. */
export function FadeText({ children }: { children: string }) {
	const reduced = usePrefersReducedMotion();
	// Only a change fades; the first text is simply there.
	const mounted = useRef(false);
	useEffect(() => {
		mounted.current = true;
	}, []);
	return (
		<motion.span
			key={children}
			initial={reduced || !mounted.current ? false : { opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: SPEED.base, ease: EASE }}
		>
			{children}
		</motion.span>
	);
}

/** Matches a `Kpi` with no trend: `hint={false}` for one with no hint, `unit` for a value with a unit. */
export function TileGhost({ hint = true, unit = false }: { hint?: boolean; unit?: boolean }) {
	return (
		<KpiGhost trend={false} className={cn(unit ? "pb-7" : "pb-[22px]", !hint && "[&>*:last-child]:hidden")} />
	);
}

/** A line of text not known yet, inside a paragraph where a `SkeletonBlock` cannot go. */
export function TextGhost({ className }: { className: string }) {
	return <span aria-hidden="true" className={cn("tide inline-block h-3 rounded-md bg-muted", className)} />;
}

/** Matches a `DataTable`: its search box, then a sheet with the real column titles. */
export function TableGhost({
	columns,
	rows = 6,
	twoLine = false,
}: {
	columns: string[];
	rows?: number;
	/** Rows whose first cell has a second line of text, such as a user and their email. */
	twoLine?: boolean;
}) {
	const grid = { gridTemplateColumns: `minmax(11rem,1.6fr) repeat(${columns.length - 1},minmax(7rem,1fr))` };
	return (
		<div className="space-y-3">
			<SkeletonBlock className="h-8 w-full rounded-lg sm:w-64" />
			<div className="group-sheet overflow-hidden px-1">
				<div className="min-w-[40rem] divide-y divide-border">
					<div className="grid h-9 items-center text-[13px] text-muted-foreground" style={grid}>
						{columns.map((column) => (
							<span key={column} className="truncate px-3 font-medium">
								{column}
							</span>
						))}
					</div>
					{repeat(rows, (row) => (
						<div
							key={row}
							className={cn("grid items-center", twoLine ? "h-[53px]" : "h-[45px]")}
							style={grid}
						>
							<div className="flex items-center gap-3 px-3">
								<SkeletonBlock className="size-7 shrink-0 rounded-full" />
								<div className="min-w-0 flex-1 space-y-1.5">
									<SkeletonBlock className="h-3.5 w-3/5" />
									{twoLine && <SkeletonBlock className="h-3 w-4/5" />}
								</div>
							</div>
							{repeat(columns.length - 1, (cell) => (
								<div key={cell} className="px-3">
									<SkeletonBlock className="h-3.5 w-2/3" />
								</div>
							))}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

/** Matches `AccessMatrixView`: bucket titles across, a row of cells per identity, then the legend. */
export function MatrixGhost({ rows = 4, columns = 7 }: { rows?: number; columns?: number }) {
	return (
		<div className="overflow-hidden">
			<div className="min-w-[32rem] space-y-1 pb-1">
				<div className="flex h-8 items-end gap-1 pb-1.5">
					<span className="w-36 shrink-0" />
					{repeat(columns, (i) => (
						<SkeletonBlock key={i} className="h-3 flex-1" />
					))}
				</div>
				{repeat(rows, (row) => (
					<div key={row} className="flex items-center gap-1">
						<div className="flex w-36 shrink-0 items-center gap-2">
							<SkeletonBlock className="size-6 shrink-0 rounded-full" />
							<SkeletonBlock className="h-3.5 w-20" />
						</div>
						{repeat(columns, (cell) => (
							<SkeletonBlock key={cell} className="h-6 flex-1 rounded-[5px]" />
						))}
					</div>
				))}
			</div>
			<SkeletonBlock className="mt-5 h-4 w-64" />
		</div>
	);
}

/** Matches a `BarList`, or `ExposureBars` with its `legend`: a label, a thin bar and a value per row. */
export function BarsGhost({ rows = 4, legend = false }: { rows?: number; legend?: boolean }) {
	return (
		<div>
			<div className="space-y-2.5">
				{repeat(rows, (i) => (
					<div key={i} className="grid h-5 grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3">
						<SkeletonBlock className="h-3.5 w-20" />
						<SkeletonBlock className="h-1.5" />
						<SkeletonBlock className="h-3.5 w-14" />
					</div>
				))}
			</div>
			{legend && <SkeletonBlock className="mt-3 h-4 w-48" />}
		</div>
	);
}

const COLUMN_HEIGHTS = [70, 35, 50, 20, 60, 30];

/** Matches `Columns` of the same height, on its baseline. */
export function ColumnsGhost({ height = 170 }: { height?: number }) {
	return (
		<div className="flex items-end justify-around pt-[18px] pb-5" style={{ height }}>
			{COLUMN_HEIGHTS.map((share) => (
				<div key={share} className="w-6" style={{ height: `${share}%` }}>
					<SkeletonBlock className="h-full rounded-t-sm rounded-b-none" />
				</div>
			))}
		</div>
	);
}

/** Matches a small `Ring` beside its legend. */
export function SmallRingGhost({ rows = 4, className }: { rows?: number; className: string }) {
	return (
		<div className="flex flex-wrap items-center gap-6">
			<SkeletonBlock className={cn("shrink-0 rounded-full", className)} />
			<div className="space-y-2">
				{repeat(rows, (i) => (
					<SkeletonBlock key={i} className="h-4 w-36" />
				))}
			</div>
		</div>
	);
}

/** Matches a sheet of one-line rows with a leading glyph, such as members or groups. */
export function SheetRowsGhost({ rows = 3 }: { rows?: number }) {
	return (
		<div className="group-sheet divide-y divide-border">
			{repeat(Math.max(1, rows), (i) => (
				<div key={i} className="flex h-10 items-center gap-2.5 px-4">
					<SkeletonBlock className="size-4 shrink-0 rounded-full" />
					<SkeletonBlock className="h-3.5 w-2/5" />
				</div>
			))}
		</div>
	);
}

/** Matches an `InfoList` of the same length. */
export function InfoGhost({ rows = 4 }: { rows?: number }) {
	return (
		<div className="group-sheet divide-y divide-border">
			{repeat(rows, (i) => (
				<div key={i} className="flex min-h-10 items-center justify-between gap-4 px-4 py-2">
					<SkeletonBlock className="h-3.5 w-24" />
					<SkeletonBlock className="h-3.5 w-20" />
				</div>
			))}
		</div>
	);
}

/** Matches a `ReachGrid` inside its sheet: a title row, then a row per bucket. */
export function ReachGhost({ rows = 2 }: { rows?: number }) {
	return (
		<div>
			<SkeletonBlock className="mb-3.5 h-3 w-full" />
			{repeat(rows, (i) => (
				<div key={i} className="flex h-[38px] items-center gap-6">
					<SkeletonBlock className="h-3.5 w-1/4" />
					<SkeletonBlock className="h-3 flex-1" />
				</div>
			))}
		</div>
	);
}

/** Matches the policy editor: its real title bar, the document, and the status line. */
export function EditorGhost({ lines = 21 }: { lines?: number }) {
	return (
		<div className="group-sheet overflow-hidden">
			<div className="flex h-9 items-center justify-between gap-3 border-border border-b px-4">
				<span className="font-semibold text-[13px]">Policy document</span>
				<SkeletonBlock className="h-3 w-12" />
			</div>
			<div className="space-y-2 bg-raised/60 py-3 pr-4 pl-11">
				{repeat(lines, (i) => (
					<SkeletonBlock key={i} className="h-3" />
				))}
			</div>
			<div className="flex min-h-9 items-center border-border border-t px-4">
				<SkeletonBlock className="h-3 w-40" />
			</div>
		</div>
	);
}
