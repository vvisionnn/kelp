import { cn } from "@/lib/utils";

export interface LegendItem {
	label: string;
	color: string;
	/** Lines key with a short stroke, bars and areas with a swatch. */
	shape?: "line" | "swatch";
	value?: string;
}

/** Series identity, always present for two or more series (dataviz rule). Text stays in ink. */
export function Legend({ items, className }: { items: LegendItem[]; className?: string }) {
	return (
		<ul
			className={cn(
				"flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground",
				className,
			)}
		>
			{items.map((item) => (
				<li key={item.label} className="flex items-center gap-1.5">
					<span
						aria-hidden="true"
						className={item.shape === "line" ? "h-0.5 w-3 rounded-full" : "size-2 rounded-[2px]"}
						style={{ background: item.color }}
					/>
					{item.label}
					{item.value && <span className="font-medium text-foreground tabular">{item.value}</span>}
				</li>
			))}
		</ul>
	);
}
