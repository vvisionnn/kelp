import type { EcVolume } from "@shared/storage.ts";
import { motion } from "motion/react";
import { usePrefersReducedMotion } from "@/components/kelp/motion.ts";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatBytes } from "@/lib/format.ts";
import { cn } from "@/lib/utils";

/** Diagonal hatching marks parity shards, so data vs. parity never depends on color alone. */
export const PARITY_TEXTURE =
	"bg-[image:repeating-linear-gradient(135deg,transparent_0_3px,color-mix(in_oklab,var(--card)_55%,transparent)_3px_5px)]";

/** Categorical fills in fixed order; servers beyond five share a neutral "other" fill. */
const SERVER_FILLS = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"];
const OTHER_FILL = "bg-muted-foreground/45";

export function serverFill(palette: Map<string, number>, server: string): string {
	const index = palette.get(server);
	return index !== undefined && index < SERVER_FILLS.length ? (SERVER_FILLS[index] as string) : OTHER_FILL;
}

interface ShardCell {
	id: number;
	holders: Array<{ server: string; size: number }>;
}

export function shardCells(ec: EcVolume): ShardCell[] {
	return Array.from({ length: ec.totalShards }, (_, id) => ({
		id,
		holders: ec.placements.flatMap((p) =>
			p.shards.filter((s) => s.id === id).map((s) => ({ server: p.server, size: s.size })),
		),
	}));
}

/**
 * One EC volume as a strip of shards, colored by the server holding each one. Data and parity
 * shards sit in separate groups; missing shards are hollow and outlined in red.
 */
export function ShardMap({
	ec,
	palette,
	size = "sm",
}: {
	ec: EcVolume;
	palette: Map<string, number>;
	size?: "sm" | "lg";
}) {
	const reduced = usePrefersReducedMotion();
	const cells = shardCells(ec);
	const groups =
		ec.dataShards > 0
			? [
					{ label: "Data", cells: cells.slice(0, ec.dataShards) },
					{ label: "Parity", cells: cells.slice(ec.dataShards) },
				]
			: [{ label: "Shards", cells }];
	const cell = size === "lg" ? "size-6 rounded sm:size-9 sm:rounded-md" : "size-3.5 rounded-[3px]";

	return (
		<div className={cn("flex items-end", size === "lg" ? "flex-wrap gap-4" : "gap-2")}>
			{groups.map((group, groupIndex) => (
				<div key={group.label}>
					{size === "lg" && <p className="mb-1.5 text-muted-foreground text-xs">{group.label}</p>}
					<ul
						className={cn("flex", size === "lg" ? "gap-1 sm:gap-1.5" : "gap-0.5")}
						aria-label={`${group.label} shards of volume ${ec.id}`}
					>
						{group.cells.map((shard, index) => {
							const missing = shard.holders.length === 0;
							const label = missing
								? `Shard ${shard.id}: missing`
								: `Shard ${shard.id}: ${shard.holders.map((h) => h.server).join(", ")}`;
							return (
								<li key={shard.id} className="flex flex-col items-center gap-1">
									<Tooltip>
										<TooltipTrigger
											render={
												<motion.span
													role="img"
													aria-label={label}
													initial={reduced ? false : { opacity: 0, scale: 0.4 }}
													animate={{ opacity: 1, scale: 1 }}
													transition={{
														delay: reduced ? 0 : (groupIndex * group.cells.length + index) * 0.025,
														type: "spring",
														stiffness: 420,
														damping: 26,
													}}
													className={cn(
														"relative block",
														cell,
														missing
															? "border border-destructive border-dashed bg-destructive/10"
															: serverFill(palette, shard.holders[0]?.server ?? ""),
														groupIndex > 0 && !missing && PARITY_TEXTURE,
													)}
												>
													{shard.holders.length > 1 && (
														<span className="absolute -top-1 -right-1 size-2 rounded-full bg-warning ring-2 ring-card" />
													)}
												</motion.span>
											}
										/>
										<TooltipContent>
											{missing ? (
												`Shard ${shard.id} is missing`
											) : (
												<span>
													Shard {shard.id} on{" "}
													<span className="font-mono">{shard.holders.map((h) => h.server).join(", ")}</span>
													{" · "}
													{formatBytes(shard.holders[0]?.size ?? 0)}
												</span>
											)}
										</TooltipContent>
									</Tooltip>
									{size === "lg" && <span className="text-muted-foreground text-xs tabular">{shard.id}</span>}
								</li>
							);
						})}
					</ul>
				</div>
			))}
		</div>
	);
}

/** Which color is which server, with how many shards each holds. */
export function ServerLegend({
	palette,
	counts,
	showMissing = false,
	showParity = true,
}: {
	palette: Map<string, number>;
	counts: Map<string, number>;
	showMissing?: boolean;
	showParity?: boolean;
}) {
	const servers = [...palette.keys()];
	const shown = servers.slice(0, SERVER_FILLS.length);
	const others = servers.slice(SERVER_FILLS.length);
	const otherCount = others.reduce((sum, s) => sum + (counts.get(s) ?? 0), 0);
	return (
		<ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Servers">
			{shown.map((server) => (
				<li key={server} className="flex items-center gap-2">
					<span className={cn("size-2.5 rounded-[3px]", serverFill(palette, server))} />
					<span className="font-mono text-xs">{server}</span>
					<span className="text-muted-foreground text-xs tabular">{counts.get(server) ?? 0} shards</span>
				</li>
			))}
			{others.length > 0 && (
				<li className="flex items-center gap-2">
					<span className={cn("size-2.5 rounded-[3px]", OTHER_FILL)} />
					<span className="text-xs">{others.length} more servers</span>
					<span className="text-muted-foreground text-xs tabular">{otherCount} shards</span>
				</li>
			)}
			{showParity && (
				<li className="flex items-center gap-2">
					<span className={cn("size-2.5 rounded-[3px] bg-muted-foreground/60", PARITY_TEXTURE)} />
					<span className="text-xs">Parity</span>
				</li>
			)}
			{showMissing && (
				<li className="flex items-center gap-2">
					<span className="size-2.5 rounded-[3px] border border-destructive border-dashed bg-destructive/10" />
					<span className="text-xs">Missing</span>
				</li>
			)}
		</ul>
	);
}

/** "0, 1, 2, 5" → "0–2, 5". */
export function shardRanges(ids: number[]): string {
	const sorted = [...new Set(ids)].sort((a, b) => a - b);
	const ranges: string[] = [];
	for (let i = 0; i < sorted.length; i++) {
		const start = sorted[i] as number;
		let end = start;
		while (sorted[i + 1] === end + 1) end = sorted[++i] as number;
		ranges.push(start === end ? String(start) : `${start}–${end}`);
	}
	return ranges.join(", ");
}
