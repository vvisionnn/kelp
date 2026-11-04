import type { StorageCollection } from "@shared/storage.ts";
import { motion } from "motion/react";
import { usePrefersReducedMotion } from "@/components/kelp/motion.ts";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatBytes, formatPercent, ratio } from "@/lib/format.ts";
import { collectionLabel } from "@/lib/storage-queries.ts";
import { cn } from "@/lib/utils";

const FILLS = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4"];
const OTHER = "bg-foreground/30";

export interface ShareSegment {
	key: string;
	label: string;
	size: number;
	fraction: number;
	fill: string;
}

/**
 * The four largest collections get their own hue in fixed order; the rest fold into "Other".
 * Colors follow the collection's name order among the top four, so sorting never repaints them.
 */
export function shareSegments(collections: StorageCollection[]): ShareSegment[] {
	const total = collections.reduce((sum, c) => sum + c.size, 0);
	const bySize = [...collections].filter((c) => c.size > 0).sort((a, b) => b.size - a.size);
	const top = bySize.slice(0, FILLS.length);
	const colorOrder = [...top].sort((a, b) => a.name.localeCompare(b.name)).map((c) => c.name);
	const segments: ShareSegment[] = top.map((c) => ({
		key: c.name,
		label: collectionLabel(c.name),
		size: c.size,
		fraction: ratio(c.size, total),
		fill: FILLS[colorOrder.indexOf(c.name)] as string,
	}));
	const rest = bySize.slice(FILLS.length);
	if (rest.length > 0) {
		const size = rest.reduce((sum, c) => sum + c.size, 0);
		segments.push({
			key: "~other",
			label: `${rest.length} other`,
			size,
			fraction: ratio(size, total),
			fill: OTHER,
		});
	}
	return segments;
}

export function CollectionShare({ collections }: { collections: StorageCollection[] }) {
	const reduced = usePrefersReducedMotion();
	const segments = shareSegments(collections);
	if (segments.length === 0) {
		return <p className="text-foreground/70 text-sm">Nothing stored yet.</p>;
	}
	return (
		<div>
			<div
				className="flex h-4 w-full gap-[2px] overflow-hidden rounded-full"
				role="img"
				aria-label="Share of stored bytes by collection"
			>
				{segments.map((segment, index) => (
					<Tooltip key={segment.key}>
						<TooltipTrigger
							render={
								<motion.span
									className={cn(
										"block h-full min-w-1 first:rounded-l-full last:rounded-r-full",
										segment.fill,
									)}
									initial={reduced ? false : { flexGrow: 0 }}
									animate={{ flexGrow: segment.fraction }}
									style={{ flexBasis: 0 }}
									transition={{ duration: 0.7, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
								/>
							}
						/>
						<TooltipContent>
							{segment.label}: {formatBytes(segment.size)} ({formatPercent(segment.fraction)})
						</TooltipContent>
					</Tooltip>
				))}
			</div>
			<ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
				{segments.map((segment) => (
					<li key={segment.key} className="flex items-center gap-2">
						<span className={cn("size-2.5 rounded-[3px]", segment.fill)} />
						<span>{segment.label}</span>
						<span className="text-foreground/60 tabular">{formatPercent(segment.fraction)}</span>
					</li>
				))}
			</ul>
		</div>
	);
}
