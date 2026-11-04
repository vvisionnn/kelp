import type { StorageVolume } from "@shared/storage.ts";
import { motion } from "motion/react";
import { usePrefersReducedMotion } from "@/components/kelp/motion.ts";
import { formatBytes, formatCount, formatPercent, ratio } from "@/lib/format.ts";
import { cn } from "@/lib/utils";
import { PARITY_TEXTURE } from "./shard-map.tsx";

/** How many bars the skyline draws before it shows only the fullest volumes. */
export const SKYLINE_LIMIT = 160;

/** The volumes the skyline draws: all of them in id order, or the fullest ones when there are many. */
export function skylineVolumes(volumes: StorageVolume[]): StorageVolume[] {
	const byId = [...volumes].sort((a, b) => a.id - b.id);
	if (byId.length <= SKYLINE_LIMIT) return byId;
	const fullest = new Set(
		[...volumes]
			.sort((a, b) => b.fullness - a.fullness)
			.slice(0, SKYLINE_LIMIT)
			.map((v) => v.id),
	);
	return byId.filter((v) => fullest.has(v.id));
}

/**
 * The bytes a full-height bar stands for: the size limit once some volume is at least half full,
 * otherwise the largest volume, so a young cluster's skyline is not a flat line.
 */
export function skylineScale(volumes: StorageVolume[], limit: number): number {
	const largest = Math.max(0, ...volumes.map((v) => v.size));
	return largest >= limit / 2 ? limit : Math.max(largest, 1);
}

/**
 * Every volume as a bar: live data in ink, reclaimable garbage in the area hue on top. Read-only
 * volumes are drawn faint, nearly full ones in amber. One glance shows how the fleet fills and where
 * a vacuum would pay off.
 */
export function VolumeSkyline({
	volumes,
	limit,
	className,
}: {
	volumes: StorageVolume[];
	limit: number;
	className?: string;
}) {
	const reduced = usePrefersReducedMotion();
	const shown = skylineVolumes(volumes);
	const scale = skylineScale(volumes, limit);
	const full = volumes.filter((v) => v.fullness >= 0.95).length;
	const readOnly = volumes.filter((v) => v.readOnly).length;
	const label = `${formatCount(volumes.length)} volumes by fill level. ${full} nearly full, ${readOnly} read-only.`;
	return (
		<div className={className}>
			<div role="img" aria-label={label} className="flex h-36 items-end gap-[2px]">
				{shown.map((volume, index) => {
					const height = Math.max(0.03, Math.min(1, volume.size / scale));
					const garbage = ratio(volume.deletedBytes, volume.size);
					return (
						<motion.span
							key={volume.id}
							title={`Volume ${volume.id}: ${formatPercent(volume.fullness)} full`}
							className={cn(
								"flex min-w-[3px] max-w-6 flex-1 origin-bottom flex-col overflow-hidden rounded-t-[3px]",
								volume.readOnly && "opacity-35",
							)}
							style={{ height: `${height * 100}%` }}
							initial={reduced ? false : { scaleY: 0 }}
							animate={{ scaleY: 1 }}
							transition={{ duration: 0.6, delay: Math.min(index * 0.006, 0.6), ease: [0.22, 1, 0.36, 1] }}
						>
							{garbage > 0 && (
								<span className="block w-full bg-area" style={{ height: `${garbage * 100}%` }} />
							)}
							<span
								className={cn(
									"block w-full flex-1",
									volume.fullness >= 0.95 ? "bg-warning" : "bg-foreground/85",
								)}
							/>
						</motion.span>
					);
				})}
			</div>
			<div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-foreground/70">
				<LegendSwatch className="bg-foreground/85" label="Live data" />
				<LegendSwatch className="bg-area" label="Garbage" />
				<LegendSwatch className="bg-warning" label="Nearly full" />
				<LegendSwatch className="bg-foreground/30" label="Read-only" />
				<span className="ml-auto">
					{scale === limit
						? `Bars fill to the ${formatBytes(limit)} limit`
						: `Bars scaled to the largest volume, ${formatBytes(scale)}`}
				</span>
				{shown.length < volumes.length && (
					<span>
						Fullest {formatCount(shown.length)} of {formatCount(volumes.length)}
					</span>
				)}
			</div>
		</div>
	);
}

export function LegendSwatch({ className, label }: { className: string; label: string }) {
	return (
		<span className="inline-flex items-center gap-2">
			<span className={cn("size-2.5 rounded-[3px]", className)} />
			{label}
		</span>
	);
}

/**
 * A volume as a tank: live data, then reclaimable garbage, then free room up to the size limit.
 * Values are spelled out underneath, so color is never the only cue.
 */
export function FillGauge({ size, deleted, limit }: { size: number; deleted: number; limit: number }) {
	const reduced = usePrefersReducedMotion();
	const live = Math.max(0, size - deleted);
	const capacity = Math.max(limit, size);
	const segments = [
		{ key: "live", label: "Live data", value: live, fill: "bg-foreground/85" },
		{ key: "garbage", label: "Reclaimable", value: deleted, fill: "bg-area" },
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
				className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-foreground/10"
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
			<dl className="mt-4 grid grid-cols-3 gap-4 text-[13px]">
				{[...segments, { key: "free", label: "Free", value: capacity - size, fill: "bg-foreground/10" }].map(
					(segment) => (
						<div key={segment.key}>
							<dt className="flex items-center gap-2 text-foreground/70">
								<span className={cn("size-2.5 rounded-[3px]", segment.fill)} />
								{segment.label}
							</dt>
							<dd className="mt-1 text-[15px] tabular">{formatBytes(segment.value)}</dd>
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
	const reduced = usePrefersReducedMotion();
	return (
		<div
			role="img"
			aria-label={`${data} data shards and ${parity} parity shards; any ${data} rebuild the volume`}
			className="flex flex-wrap items-end gap-6"
		>
			{[
				{ label: `${data} data shards`, count: data, parity: false },
				{ label: `${parity} parity shards`, count: parity, parity: true },
			].map((group, groupIndex) => (
				<div key={group.label}>
					<div className="flex gap-1.5">
						{Array.from({ length: group.count }, (_, i) => (
							<motion.span
								// biome-ignore lint/suspicious/noArrayIndexKey: shards are positional.
								key={i}
								className={cn(
									"block h-14 w-5 rounded-md sm:h-16 sm:w-7",
									group.parity ? cn("bg-foreground/45", PARITY_TEXTURE) : "bg-foreground/85",
								)}
								initial={reduced ? false : { opacity: 0, y: 8 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: (groupIndex * data + i) * 0.03, duration: 0.4 }}
							/>
						))}
					</div>
					<p className="mt-2 text-[13px] text-foreground/70">{group.label}</p>
				</div>
			))}
		</div>
	);
}

/** A part of a whole, in ink on the aurora. Not a capacity meter: it never turns amber. */
export function ShareBar({ fraction }: { fraction: number }) {
	const reduced = usePrefersReducedMotion();
	return (
		<div className="mt-8 h-2 w-full overflow-hidden rounded-full bg-foreground/10" aria-hidden="true">
			<motion.div
				className="h-full rounded-full bg-foreground/85"
				initial={reduced ? false : { width: 0 }}
				animate={{ width: `${Math.min(1, fraction) * 100}%` }}
				transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
			/>
		</div>
	);
}
