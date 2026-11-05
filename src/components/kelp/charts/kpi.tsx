import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Metric } from "../page.tsx";
import { Sparkline } from "./sparkline.tsx";
import { useWidth } from "./use-width.ts";

/**
 * A stat tile (dataviz contract): label, value with a lighter unit (whole numbers roll their
 * digits when they change), an optional hint and an
 * optional trend sparkline along the bottom in the tile's series color.
 */
export function Kpi({
	label,
	value,
	unit,
	hint,
	trend,
	color = "var(--data-1)",
	tone,
	className,
}: {
	label: string;
	value: ReactNode;
	unit?: string;
	hint?: ReactNode;
	trend?: Array<number | null>;
	color?: string;
	/** Marks the value as a warning or a problem; pair it with a hint that says why. */
	tone?: "warn" | "bad";
	className?: string;
}) {
	return (
		<section aria-label={label} className={cn("group-sheet flex min-w-0 flex-col p-4", className)}>
			<p className="truncate text-[13px] text-muted-foreground">{label}</p>
			<p
				className={cn(
					"mt-1 font-rounded font-semibold text-[28px] leading-8 tracking-[-0.02em]",
					tone === "warn" && "text-warning",
					tone === "bad" && "text-destructive",
				)}
			>
				{typeof value === "number" ? <Metric value={value} /> : value}
				{unit && <span className="ml-1 font-medium text-[15px] text-muted-foreground">{unit}</span>}
			</p>
			{hint && <p className="truncate text-[12px] text-muted-foreground">{hint}</p>}
			{trend && trend.length > 1 && <KpiTrend values={trend} color={color} label={`${label} trend`} />}
		</section>
	);
}

/** A full-width sparkline along the bottom of a stat tile, sized to the tile. */
function KpiTrend({ values, color, label }: { values: Array<number | null>; color: string; label: string }) {
	const [ref, width] = useWidth<HTMLDivElement>(160);
	return (
		<div ref={ref} className="mt-3 -mb-1 min-w-0 overflow-hidden">
			<Sparkline
				values={values}
				color={color}
				width={width}
				height={28}
				label={label}
				className="max-w-full"
			/>
		</div>
	);
}

/** Splits a formatted value like "42.7 MiB" into number and unit for a Kpi. */
export function splitUnit(text: string): { value: string; unit?: string } {
	const match = /^([-−\d.,<>]+%?)\s*(.*)$/.exec(text);
	if (!match) return { value: text };
	return match[2] ? { value: match[1] as string, unit: match[2] } : { value: match[1] as string };
}
