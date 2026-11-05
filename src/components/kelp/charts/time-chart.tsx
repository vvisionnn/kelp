import { scaleLinear, scaleTime } from "d3-scale";
import { area, curveMonotoneX, line } from "d3-shape";
import { type KeyboardEvent, type PointerEvent, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { clock, clockSeconds, compact } from "./format.ts";
import { Legend } from "./legend.tsx";
import { useWidth } from "./use-width.ts";

export interface TimeSeries {
	label: string;
	/** A data palette token, e.g. "var(--data-1)". Series keep their color across filters. */
	color: string;
	values: Array<number | null>;
}

const MARGIN = { top: 8, right: 8, bottom: 22, left: 44 };

/**
 * The top of the y axis. A lone spike (a startup burst, one slow request) would flatten
 * everything else, so when the largest value is far above the 95th percentile the axis fits
 * the typical range and the spike is drawn clipped at the top. Tooltips still show real values.
 */
export function robustTop(values: number[]): { top: number; clipped: boolean } {
	const max = Math.max(0, ...values);
	if (values.length < 8) return { top: max, clipped: false };
	const sorted = [...values].sort((a, b) => a - b);
	const p95 = sorted[Math.floor((sorted.length - 1) * 0.95)] as number;
	if (p95 > 0 && max > p95 * 4) return { top: p95 * 1.5, clipped: true };
	return { top: max, clipped: false };
}

/**
 * A time series chart: lines, washed areas or stacked areas over a shared time axis, with a
 * crosshair that snaps to the nearest sample and lists every series (dataviz rules). Keyboard:
 * focus the chart and use the arrow keys.
 */
export function TimeChart({
	times,
	series,
	mode = "line",
	height = 200,
	format = compact,
	label,
	empty = "Collecting data. The first points appear within a minute.",
	className,
}: {
	/** Sample times, ms since epoch, aligned with every series' values. */
	times: number[];
	series: TimeSeries[];
	mode?: "line" | "area" | "stacked";
	height?: number;
	format?: (value: number) => string;
	/** What the chart shows, for screen readers and the data table. */
	label: string;
	empty?: string;
	className?: string;
}) {
	const [ref, width] = useWidth<HTMLDivElement>();
	const [active, setActive] = useState<number | null>(null);
	const innerWidth = Math.max(10, width - MARGIN.left - MARGIN.right);
	const innerHeight = height - MARGIN.top - MARGIN.bottom;
	const spanDays = times.length > 1 ? ((times.at(-1) as number) - (times[0] as number)) / 86_400_000 : 0;

	const stacked = useMemo(() => {
		if (mode !== "stacked") return null;
		const sums = times.map(() => 0);
		return series.map((s) =>
			s.values.map((v, i) => {
				const low = sums[i] as number;
				sums[i] = low + (v ?? 0);
				return [low, sums[i] as number] as const;
			}),
		);
	}, [mode, series, times]);

	const { top: maxValue, clipped } = useMemo(() => {
		const values = stacked
			? stacked.flatMap((s) => s.map((p) => p[1]))
			: series.flatMap((s) => s.values.filter((v): v is number => v !== null));
		return robustTop(values);
	}, [series, stacked]);

	if (times.length < 2) {
		return (
			<div
				ref={ref}
				className={cn("flex items-center justify-center text-[13px] text-muted-foreground", className)}
				style={{ height }}
			>
				{empty}
			</div>
		);
	}

	const x = scaleTime()
		.domain([times[0] as number, times.at(-1) as number])
		.range([0, innerWidth]);
	const y = scaleLinear()
		.domain([0, maxValue || 1])
		.nice(4)
		.range([innerHeight, 0])
		.clamp(true);
	const yTicks = y.ticks(4);
	const xTicks = x.ticks(Math.max(2, Math.min(6, Math.floor(innerWidth / 110))));
	// Ticks closer than a minute apart need seconds, or the labels repeat.
	const withSeconds =
		xTicks.length > 1 && (xTicks[1] as Date).getTime() - (xTicks[0] as Date).getTime() < 60_000;

	const linePath = (values: Array<number | null>) =>
		line<number | null>()
			.defined((v) => v !== null)
			.x((_, i) => x(times[i] as number))
			.y((v) => y(v ?? 0))
			.curve(curveMonotoneX)(values) ?? "";
	const areaPath = (values: Array<number | null>) =>
		area<number | null>()
			.defined((v) => v !== null)
			.x((_, i) => x(times[i] as number))
			.y0(innerHeight)
			.y1((v) => y(v ?? 0))
			.curve(curveMonotoneX)(values) ?? "";
	const bandPath = (band: ReadonlyArray<readonly [number, number]>) =>
		area<readonly [number, number]>()
			.x((_, i) => x(times[i] as number))
			.y0((p) => y(p[0]))
			.y1((p) => y(p[1]))
			.curve(curveMonotoneX)(band) ?? "";

	const nearest = (clientX: number, rect: DOMRect) => {
		const at = x.invert(clientX - rect.left - MARGIN.left).getTime();
		let best = 0;
		for (let i = 1; i < times.length; i++) {
			if (Math.abs((times[i] as number) - at) < Math.abs((times[best] as number) - at)) best = i;
		}
		return best;
	};
	const onPointerMove = (event: PointerEvent<SVGSVGElement>) =>
		setActive(nearest(event.clientX, event.currentTarget.getBoundingClientRect()));
	const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
		if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
			event.preventDefault();
			const step = event.key === "ArrowLeft" ? -1 : 1;
			setActive((current) => Math.min(times.length - 1, Math.max(0, (current ?? times.length - 1) + step)));
		} else if (event.key === "Escape") setActive(null);
	};

	const activeX = active === null ? 0 : x(times[active] as number);
	const tooltipLeft = activeX + MARGIN.left > width / 2;

	return (
		<div ref={ref} className={cn("relative", className)}>
			<svg
				role="img"
				aria-label={label}
				// biome-ignore lint/a11y/noNoninteractiveTabindex: focusable so keyboard users can read values with the arrow keys.
				tabIndex={0}
				width={width}
				height={height}
				onPointerMove={onPointerMove}
				onPointerLeave={() => setActive(null)}
				onFocus={() => setActive((current) => current ?? times.length - 1)}
				onBlur={() => setActive(null)}
				onKeyDown={onKeyDown}
				className="block touch-pan-y overflow-visible rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
					{yTicks.map((tick) => (
						<g key={tick} transform={`translate(0,${y(tick)})`}>
							<line x2={innerWidth} stroke="var(--border)" />
							<text x={-8} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular">
								{format(tick)}
							</text>
						</g>
					))}
					{xTicks.map((tick) => (
						<text
							key={tick.getTime()}
							x={x(tick)}
							y={innerHeight + 16}
							textAnchor="middle"
							className="fill-muted-foreground text-[11px] tabular"
						>
							{withSeconds ? clockSeconds(tick.getTime()) : clock(tick.getTime(), spanDays >= 1)}
						</text>
					))}
					{stacked
						? stacked.map((band, i) => (
								<path
									key={series[i]?.label}
									d={bandPath(band)}
									fill={series[i]?.color}
									fillOpacity={0.85}
									stroke="var(--card)"
									strokeWidth={1}
								/>
							))
						: series.map((s) => (
								<g key={s.label}>
									{mode === "area" && <path d={areaPath(s.values)} fill={s.color} fillOpacity={0.1} />}
									<path
										d={linePath(s.values)}
										fill="none"
										stroke={s.color}
										strokeWidth={2}
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</g>
							))}
					{active !== null && (
						<g>
							<line
								x1={activeX}
								x2={activeX}
								y2={innerHeight}
								stroke="var(--muted-foreground)"
								strokeOpacity={0.5}
							/>
							{series.map((s, i) => {
								const value = stacked ? stacked[i]?.[active]?.[1] : s.values[active];
								if (value === null || value === undefined) return null;
								return (
									<circle
										key={s.label}
										cx={activeX}
										cy={y(value)}
										r={4}
										fill={s.color}
										stroke="var(--card)"
										strokeWidth={2}
									/>
								);
							})}
						</g>
					)}
				</g>
			</svg>
			{active !== null && (
				<div
					role="status"
					className="pointer-events-none absolute top-1 z-10 min-w-36 rounded-md bg-popover px-3 py-2 text-[12px] shadow-(--float-shadow)"
					style={
						tooltipLeft
							? { right: width - (activeX + MARGIN.left) + 12 }
							: { left: activeX + MARGIN.left + 12 }
					}
				>
					<p className="mb-1 text-muted-foreground">{clock(times[active] as number, spanDays >= 1)}</p>
					{series.map((s) => (
						<p key={s.label} className="flex items-center gap-2">
							<span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
							<span className="font-semibold tabular">
								{s.values[active] === null || s.values[active] === undefined
									? "–"
									: format(s.values[active] as number)}
							</span>
							<span className="text-muted-foreground">{s.label}</span>
						</p>
					))}
				</div>
			)}
			{(series.length > 1 || clipped) && (
				<div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pl-11">
					{series.length > 1 ? (
						<Legend
							items={series.map((s) => ({
								label: s.label,
								color: s.color,
								shape: mode === "line" ? "line" : "swatch",
							}))}
						/>
					) : (
						<span />
					)}
					{clipped && (
						<p className="text-[11px] text-tertiary">
							Peaks above {format(y.domain()[1] as number)} are cut off
						</p>
					)}
				</div>
			)}
			<div className="sr-only">
				<table>
					<caption>{label}</caption>
					<thead>
						<tr>
							<th>Time</th>
							{series.map((s) => (
								<th key={s.label}>{s.label}</th>
							))}
						</tr>
					</thead>
					<tbody>
						{times.map((t, i) => (
							<tr key={t}>
								<td>{clock(t, true)}</td>
								{series.map((s) => (
									<td key={s.label}>{s.values[i] === null ? "–" : format(s.values[i] as number)}</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
