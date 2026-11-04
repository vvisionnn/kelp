import { motion } from "motion/react";
import { usePrefersReducedMotion } from "@/components/kelp/motion.ts";
import { ratio } from "@/lib/format.ts";
import { cn } from "@/lib/utils";

export interface Share {
	label: string;
	value: number;
}

/** The largest items, then everything else folded into "Other", so the bars stay readable. */
export function topShares(items: Share[], limit: number): Share[] {
	const sorted = [...items].sort((a, b) => b.value - a.value);
	if (sorted.length <= limit) return sorted;
	const rest = sorted.slice(limit - 1).reduce((sum, item) => sum + item.value, 0);
	return [...sorted.slice(0, limit - 1), { label: "Other", value: rest }];
}

/**
 * A ranked list of thin horizontal bars: one measure, one data color, values in text beside each
 * bar. Bars are scaled to the largest item so small ones stay visible.
 */
export function ShareBars({
	items,
	format,
	label,
	className,
}: {
	items: Share[];
	format: (value: number) => string;
	label: string;
	className?: string;
}) {
	const reduced = usePrefersReducedMotion();
	const max = Math.max(...items.map((item) => item.value), 0);
	return (
		<ul aria-label={label} className={cn("grid gap-2.5", className)}>
			{items.map((item, index) => {
				const width = max > 0 ? Math.max(ratio(item.value, max), item.value > 0 ? 0.015 : 0) : 0;
				return (
					<li
						key={item.label}
						className="grid grid-cols-[minmax(0,9rem)_1fr_4.5rem] items-center gap-3 text-[13px]"
					>
						<span
							className={cn(
								"truncate",
								item.label === "Other" ? "text-muted-foreground" : "font-mono text-[12px]",
							)}
						>
							{item.label}
						</span>
						<span className="h-1.5 overflow-hidden rounded-full bg-accent">
							<motion.span
								className="block h-full rounded-full bg-data-1"
								initial={reduced ? false : { width: 0 }}
								animate={{ width: `${width * 100}%` }}
								transition={{ duration: 0.5, delay: index * 0.03, ease: [0.22, 1, 0.36, 1] }}
							/>
						</span>
						<span className="text-right text-[12px] text-muted-foreground tabular">{format(item.value)}</span>
					</li>
				);
			})}
		</ul>
	);
}
