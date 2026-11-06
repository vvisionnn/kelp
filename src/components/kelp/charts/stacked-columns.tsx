import { scaleBand, scaleLinear } from "d3-scale";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useTween } from "../motion.ts";
import { labelStep } from "./columns.tsx";
import { compact } from "./format.ts";
import { Legend } from "./legend.tsx";
import { useWidth } from "./use-width.ts";

export interface StackSeries {
	key: string;
	label: string;
	color: string;
}

export interface StackColumn {
	/** Identifies the column when labels can repeat (e.g. two runs in the same minute). */
	key?: string;
	/** Axis and tooltip label, e.g. "14:00". */
	label: string;
	values: Record<string, number>;
}

const MARGIN = { top: 8, bottom: 20, left: 36 };

/**
 * Columns split into stacked parts (counts per hour by outcome, durations per run). Columns are
 * at most 24px wide with a 2px surface gap between parts and a rounded top; each column is a
 * hover and focus target whose tooltip lists every part. Two or more series get a legend.
 */
export function StackedColumns({
	columns,
	series,
	height = 180,
	format = compact,
	label,
	empty = "Nothing has happened in this range yet.",
	className,
}: {
	columns: StackColumn[];
	series: StackSeries[];
	height?: number;
	format?: (value: number) => string;
	/** What the chart shows, for screen readers and the data table. */
	label: string;
	empty?: string;
	className?: string;
}) {
	const [ref, width] = useWidth<HTMLDivElement>(600, label);
	const [active, setActive] = useState<number | null>(null);
	const totals = columns.map((c) => series.reduce((sum, s) => sum + (c.values[s.key] ?? 0), 0));
	const max = Math.max(0, ...totals);
	const innerWidth = Math.max(10, width - MARGIN.left);
	const innerHeight = height - MARGIN.top - MARGIN.bottom;
	const x = scaleBand<number>()
		.domain(columns.map((_, i) => i))
		.range([0, innerWidth])
		.paddingInner(0.3)
		.paddingOuter(0.1);
	const y = scaleLinear()
		.domain([0, max || 1])
		.nice(3)
		.range([innerHeight, 0]);
	const barWidth = Math.min(24, x.bandwidth());
	const every = labelStep(
		columns.map((c) => c.label),
		innerWidth,
	);
	const hovered = active === null ? null : columns[active];
	const glided = useTween(
		columns.flatMap((c) => series.map((s) => c.values[s.key] ?? 0)),
		{ intro: true },
	);
	const shown = (column: number, part: number) => glided[column * series.length + part] ?? 0;

	return (
		<div ref={ref} className={cn("relative", className)}>
			{max === 0 ? (
				<p className="flex items-center justify-center text-[13px] text-muted-foreground" style={{ height }}>
					{empty}
				</p>
			) : (
				<svg role="img" aria-label={label} width={width} height={height} className="block overflow-visible">
					<g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
						{y.ticks(3).map((tick) => (
							<g key={tick} transform={`translate(0,${y(tick)})`}>
								<line x2={innerWidth} stroke="var(--border)" />
								<text
									x={-8}
									dy="0.32em"
									textAnchor="end"
									className="fill-muted-foreground text-[11px] tabular"
								>
									{format(tick)}
								</text>
							</g>
						))}
						{columns.map((column, i) => {
							const cx = (x(i) ?? 0) + x.bandwidth() / 2;
							const left = cx - barWidth / 2;
							let base = innerHeight;
							const parts = series
								.map((s, part) => ({ s, value: column.values[s.key] ?? 0, drawn: shown(i, part) }))
								.filter((p) => p.value > 0);
							return (
								// biome-ignore lint/a11y/useSemanticElements: an SVG column cannot be a button; it is focusable for keyboard readout.
								<g
									key={column.key ?? column.label}
									role="button"
									tabIndex={0}
									aria-label={`${column.label}: ${parts.map((p) => `${p.s.label} ${format(p.value)}`).join(", ") || "none"}`}
									onPointerEnter={() => setActive(i)}
									onPointerLeave={() => setActive(null)}
									onFocus={() => setActive(i)}
									onBlur={() => setActive(null)}
									className="outline-none"
								>
									<rect x={x(i)} width={x.bandwidth()} y={-MARGIN.top} height={height} fill="transparent" />
									{parts.map((part, index) => {
										const top = y(y.invert(base) + part.drawn);
										const segment = Math.max(1, base - top - (index > 0 ? 2 : 0));
										const isTop = index === parts.length - 1;
										const r = isTop ? Math.min(4, segment / 2, barWidth / 2) : 0;
										const bottom = base - (index > 0 ? 2 : 0);
										const path = `M${left},${bottom}V${bottom - segment + r}Q${left},${bottom - segment} ${left + r},${bottom - segment}H${left + barWidth - r}Q${left + barWidth},${bottom - segment} ${left + barWidth},${bottom - segment + r}V${bottom}Z`;
										base = top;
										return (
											<path
												key={part.s.key}
												d={path}
												fill={part.s.color}
												opacity={active === null || active === i ? 1 : 0.5}
											/>
										);
									})}
									{i % every === 0 && (
										<text
											x={cx}
											y={innerHeight + 14}
											textAnchor="middle"
											className="fill-muted-foreground text-[11px] tabular"
										>
											{column.label}
										</text>
									)}
								</g>
							);
						})}
					</g>
				</svg>
			)}
			{hovered && active !== null && (
				<div
					role="status"
					className="pointer-events-none absolute top-0 z-10 min-w-32 rounded-md bg-popover px-3 py-2 text-[12px] shadow-(--float-shadow)"
					style={
						(x(active) ?? 0) + MARGIN.left > width / 2
							? { right: width - ((x(active) ?? 0) + MARGIN.left) + 8 }
							: { left: (x(active) ?? 0) + MARGIN.left + x.bandwidth() + 8 }
					}
				>
					<p className="mb-1 text-muted-foreground">{hovered.label}</p>
					{series.map((s) => (
						<p key={s.key} className="flex items-center gap-2">
							<span aria-hidden="true" className="size-2 rounded-[2px]" style={{ background: s.color }} />
							<span className="font-semibold tabular">{format(hovered.values[s.key] ?? 0)}</span>
							<span className="text-muted-foreground">{s.label}</span>
						</p>
					))}
				</div>
			)}
			{series.length > 1 && max > 0 && (
				<Legend className="mt-2 pl-9" items={series.map((s) => ({ label: s.label, color: s.color }))} />
			)}
			<div className="sr-only">
				<table>
					<caption>{label}</caption>
					<thead>
						<tr>
							<th>Period</th>
							{series.map((s) => (
								<th key={s.key}>{s.label}</th>
							))}
						</tr>
					</thead>
					<tbody>
						{columns.map((column) => (
							<tr key={column.key ?? column.label}>
								<td>{column.label}</td>
								{series.map((s) => (
									<td key={s.key}>{format(column.values[s.key] ?? 0)}</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
