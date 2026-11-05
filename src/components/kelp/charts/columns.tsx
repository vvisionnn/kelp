import { scaleBand, scaleLinear } from "d3-scale";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { compact } from "./format.ts";
import { useWidth } from "./use-width.ts";

export interface Column {
	label: string;
	value: number;
}

/**
 * Vertical columns over categories (a distribution, a histogram). Columns are at most 24px wide
 * with a 4px rounded top; each column is its own hover and focus target with a tooltip.
 */
export function Columns({
	columns,
	height = 160,
	color = "var(--data-1)",
	format = compact,
	label,
	className,
}: {
	columns: Column[];
	height?: number;
	color?: string;
	format?: (value: number) => string;
	label: string;
	className?: string;
}) {
	const [ref, width] = useWidth<HTMLDivElement>();
	const [active, setActive] = useState<number | null>(null);
	const margin = { top: 18, bottom: 20 };
	const innerHeight = height - margin.top - margin.bottom;
	const x = scaleBand<number>()
		.domain(columns.map((_, i) => i))
		.range([0, width])
		.paddingInner(0.25)
		.paddingOuter(0.1);
	const y = scaleLinear()
		.domain([0, Math.max(1, ...columns.map((c) => c.value))])
		.range([innerHeight, 0]);
	const barWidth = Math.min(24, x.bandwidth());
	const every = Math.max(1, Math.ceil(columns.length / Math.max(1, Math.floor(width / 56))));
	return (
		<div ref={ref} className={cn("relative", className)}>
			<svg role="img" aria-label={label} width={width} height={height} className="block overflow-visible">
				<g transform={`translate(0,${margin.top})`}>
					<line x2={width} y1={innerHeight} y2={innerHeight} stroke="var(--border)" />
					{columns.map((column, i) => {
						const cx = (x(i) ?? 0) + x.bandwidth() / 2;
						const top = y(column.value);
						const barHeight = innerHeight - top;
						const r = Math.min(4, barHeight / 2, barWidth / 2);
						const left = cx - barWidth / 2;
						return (
							// biome-ignore lint/a11y/useSemanticElements: an SVG column cannot be a button; it is focusable for keyboard readout.
							<g
								key={column.label}
								role="button"
								tabIndex={0}
								aria-label={`${column.label}: ${format(column.value)}`}
								onPointerEnter={() => setActive(i)}
								onPointerLeave={() => setActive(null)}
								onFocus={() => setActive(i)}
								onBlur={() => setActive(null)}
								className="outline-none"
							>
								<rect x={x(i)} width={x.bandwidth()} y={-margin.top} height={height} fill="transparent" />
								{barHeight > 0 && (
									<path
										d={`M${left},${innerHeight}V${top + r}Q${left},${top} ${left + r},${top}H${left + barWidth - r}Q${left + barWidth},${top} ${left + barWidth},${top + r}V${innerHeight}Z`}
										fill={color}
										opacity={active === null || active === i ? 1 : 0.5}
									/>
								)}
								{i % every === 0 && (
									<text
										x={cx}
										y={innerHeight + 14}
										textAnchor="middle"
										className="fill-muted-foreground text-[11px]"
									>
										{column.label}
									</text>
								)}
								{active === i && (
									<text
										x={cx}
										y={top - 6}
										textAnchor="middle"
										className="fill-foreground font-semibold text-[11px] tabular"
									>
										{format(column.value)}
									</text>
								)}
							</g>
						);
					})}
				</g>
			</svg>
		</div>
	);
}
