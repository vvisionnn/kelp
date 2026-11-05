import type { ReactNode } from "react";
import { ratio } from "@/lib/format.ts";
import { cn } from "@/lib/utils";

export interface BarListItem {
	key: string;
	label: ReactNode;
	value: number;
	/** The value as shown, e.g. "46 MiB". */
	display: string;
	/** Optional trailing detail, e.g. a sparkline or a secondary value. */
	extra?: ReactNode;
}

/**
 * Ranked horizontal bars: a label, a thin bar scaled to the largest value, and the value at the
 * tip. The ranking is the point, so items stay in the order given (largest first).
 */
export function BarList({
	items,
	color = "var(--data-1)",
	label,
	className,
	empty = "Nothing to show yet.",
}: {
	items: BarListItem[];
	color?: string;
	/** Names the list for screen readers. */
	label: string;
	className?: string;
	empty?: string;
}) {
	if (items.length === 0)
		return <p className="py-6 text-center text-[13px] text-muted-foreground">{empty}</p>;
	const max = Math.max(...items.map((i) => i.value));
	return (
		<ul aria-label={label} className={cn("space-y-2.5", className)}>
			{items.map((item) => (
				<li
					key={item.key}
					className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-[13px]"
				>
					<span className="truncate">{item.label}</span>
					<span className="h-1.5 overflow-hidden rounded-full bg-accent">
						<span
							className="block h-full rounded-full transition-[width] duration-500"
							style={{ width: `${Math.max(1.5, ratio(item.value, max) * 100)}%`, background: color }}
						/>
					</span>
					<span className="flex items-center gap-3">
						<span className="min-w-14 text-right text-muted-foreground tabular">{item.display}</span>
						{item.extra}
					</span>
				</li>
			))}
		</ul>
	);
}
