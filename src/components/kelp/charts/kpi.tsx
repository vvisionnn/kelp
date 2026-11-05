import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Sparkline } from "./sparkline.tsx";

/**
 * A stat tile (dataviz contract): label, value with a lighter unit, an optional hint and an
 * optional trend sparkline in the tile's series color.
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
			<div className="mt-1 flex items-end justify-between gap-3">
				<p
					className={cn(
						"font-rounded font-semibold text-[28px] leading-8 tracking-[-0.02em]",
						tone === "warn" && "text-warning",
						tone === "bad" && "text-destructive",
					)}
				>
					{value}
					{unit && <span className="ml-1 font-medium text-[15px] text-muted-foreground">{unit}</span>}
				</p>
				{trend && trend.length > 1 && (
					<Sparkline
						values={trend}
						color={color}
						width={88}
						height={30}
						label={`${label} trend`}
						className="mb-1 shrink-0"
					/>
				)}
			</div>
			{hint && <p className="mt-1 truncate text-[12px] text-muted-foreground">{hint}</p>}
		</section>
	);
}

/** Splits a formatted value like "42.7 MiB" into number and unit for a Kpi. */
export function splitUnit(text: string): { value: string; unit?: string } {
	const match = /^([-−\d.,<>]+%?)\s*(.*)$/.exec(text);
	if (!match) return { value: text };
	return match[2] ? { value: match[1] as string, unit: match[2] } : { value: match[1] as string };
}
