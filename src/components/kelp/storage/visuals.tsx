import { motion } from "motion/react";
import { usePrefersReducedMotion } from "@/components/kelp/motion.ts";
import { formatBytes, formatPercent, ratio } from "@/lib/format.ts";
import { cn } from "@/lib/utils";
import { PARITY_TEXTURE } from "./shard-map.tsx";

/**
 * A volume as a tank: live data, then reclaimable garbage, then free room up to the size limit.
 * Values are spelled out underneath, so color is never the only cue.
 */
export function FillGauge({ size, deleted, limit }: { size: number; deleted: number; limit: number }) {
	const reduced = usePrefersReducedMotion();
	const live = Math.max(0, size - deleted);
	const capacity = Math.max(limit, size);
	const segments = [
		{ key: "live", label: "Live data", value: live, fill: "bg-data-1" },
		{ key: "garbage", label: "Reclaimable", value: deleted, fill: "bg-data-2" },
	];
	return (
		<div>
			{/* biome-ignore lint/a11y/useSemanticElements: a native <meter> cannot show two segments. */}
			<div
				role="meter"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={Math.round(ratio(size, capacity) * 100)}
				aria-label={`${formatPercent(ratio(size, capacity))} of the size limit used`}
				className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-accent"
			>
				{segments.map((segment, index) =>
					segment.value > 0 ? (
						<motion.span
							key={segment.key}
							className={cn("block h-full first:rounded-l-full", segment.fill)}
							initial={reduced ? false : { width: 0 }}
							animate={{ width: `${ratio(segment.value, capacity) * 100}%` }}
							transition={{ duration: 0.8, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
						/>
					) : null,
				)}
			</div>
			<dl className="mt-3 grid grid-cols-3 gap-4 text-[12px]">
				{[...segments, { key: "free", label: "Free", value: capacity - size, fill: "bg-accent" }].map(
					(segment) => (
						<div key={segment.key}>
							<dt className="flex items-center gap-1.5 text-muted-foreground">
								<span className={cn("size-2 rounded-[2px]", segment.fill)} />
								{segment.label}
							</dt>
							<dd className="mt-0.5 font-medium text-[13px] tabular">{formatBytes(segment.value)}</dd>
						</div>
					),
				)}
			</dl>
		</div>
	);
}

/**
 * How erasure coding works, drawn: a volume cut into data shards and hatched parity shards, any
 * `data` of which rebuild it.
 */
export function EcScheme({ data = 10, parity = 4 }: { data?: number; parity?: number }) {
	return (
		<div
			role="img"
			aria-label={`${data} data shards and ${parity} parity shards; any ${data} rebuild the volume`}
			className="flex flex-wrap items-end gap-4"
		>
			{[
				{ label: `${data} data shards`, count: data, parity: false },
				{ label: `${parity} parity shards`, count: parity, parity: true },
			].map((group) => (
				<div key={group.label}>
					<div className="flex gap-1">
						{Array.from({ length: group.count }, (_, i) => (
							<span
								// biome-ignore lint/suspicious/noArrayIndexKey: shards are positional.
								key={i}
								className={cn(
									"block h-9 w-3.5 rounded-[3px]",
									group.parity ? cn("bg-data-4/70", PARITY_TEXTURE) : "bg-data-1",
								)}
							/>
						))}
					</div>
					<p className="mt-1.5 text-[12px] text-muted-foreground">{group.label}</p>
				</div>
			))}
		</div>
	);
}
