import { Link, type LinkProps } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { usePrefersReducedMotion } from "@/components/kelp/motion.ts";
import { ratio } from "@/lib/format.ts";
import { cn } from "@/lib/utils";

/** The way back from a detail page: a quiet pill above the title. */
export function BackPill({ children, ...link }: LinkProps & { children: ReactNode }) {
	return (
		<Link
			{...link}
			className="mt-6 inline-flex h-8 w-fit items-center gap-1.5 rounded-full bg-secondary pr-3.5 pl-2.5 text-[13px] text-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
		>
			<ArrowLeft className="size-3.5" />
			{children}
		</Link>
	);
}

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
 * A ranked list of horizontal bars in the area's hue: one measure, one color, values in text beside
 * each bar. Bars are scaled to the largest item so small ones stay visible.
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
		<ul aria-label={label} className={cn("grid gap-3.5", className)}>
			{items.map((item, index) => {
				const width = max > 0 ? Math.max(ratio(item.value, max), item.value > 0 ? 0.015 : 0) : 0;
				return (
					<li
						key={item.label}
						className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-4 text-sm"
					>
						<span
							className={cn(
								"truncate",
								item.label === "Other" ? "text-muted-foreground" : "font-mono text-[13px]",
							)}
						>
							{item.label}
						</span>
						<span className="h-2 overflow-hidden rounded-full bg-foreground/[0.06]">
							<motion.span
								className="block h-full rounded-full bg-area"
								initial={reduced ? false : { width: 0 }}
								animate={{ width: `${width * 100}%` }}
								transition={{ duration: 0.8, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
							/>
						</span>
						<span className="text-right text-muted-foreground tabular">{format(item.value)}</span>
					</li>
				);
			})}
		</ul>
	);
}

/** Label/value facts split by hairlines, for the quiet details beside a signature card. */
export function Facts({
	items,
	className,
}: {
	items: Array<{ label: string; value: ReactNode; mono?: boolean }>;
	className?: string;
}) {
	return (
		<dl className={cn("divide-y divide-hairline", className)}>
			{items.map((item) => (
				<div key={item.label} className="flex items-baseline justify-between gap-6 py-3 first:pt-0 last:pb-0">
					<dt className="shrink-0 text-[13px] text-muted-foreground">{item.label}</dt>
					<dd className={cn("min-w-0 break-all text-right", item.mono ? "font-mono text-[13px]" : "text-sm")}>
						{item.value}
					</dd>
				</div>
			))}
		</dl>
	);
}
