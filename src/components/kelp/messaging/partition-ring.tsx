import type { TopicPartition } from "@shared/messaging.ts";
import { motion } from "motion/react";
import { useState } from "react";
import { formatBytes, formatCount } from "@/lib/format.ts";

const RING = 2520;
/** Categorical hues in fixed order; a broker keeps its color as long as it leads. */
const HUES = ["var(--data-1)", "var(--data-2)", "var(--data-3)", "var(--data-4)", "var(--data-5)"];
const SIZE = 184;
const RADIUS = 76;
const STROKE = 14;
/** Visual gap between arcs, in slots. */
const GAP = 30;

function point(slot: number): [number, number] {
	const angle = (slot / RING) * Math.PI * 2 - Math.PI / 2;
	return [SIZE / 2 + RADIUS * Math.cos(angle), SIZE / 2 + RADIUS * Math.sin(angle)];
}

/** SVG arc from slot `start` to `stop`, inset by half a gap on each side. */
export function arcPath(start: number, stop: number, gap = GAP): string {
	const span = stop - start;
	const inset = span > gap * 2 ? gap / 2 : 0;
	const from = start + inset;
	// A full circle cannot be one arc; stop just short of closing it.
	const to = Math.min(stop - inset, from + RING - 0.01);
	const [x1, y1] = point(from);
	const [x2, y2] = point(to);
	const large = to - from > RING / 2 ? 1 : 0;
	return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/** Leader -> color, in first-seen order so colors stay stable across renders. */
export function leaderColors(partitions: TopicPartition[]): Map<string, string> {
	const colors = new Map<string, string>();
	for (const p of partitions) {
		if (!colors.has(p.leader)) colors.set(p.leader, HUES[colors.size % HUES.length] as string);
	}
	return colors;
}

/**
 * SeaweedMQ hashes keys onto a ring of 2520 slots and gives each partition a contiguous range.
 * Drawing the ring shows how evenly the topic is split and which broker leads each part.
 */
export function PartitionRing({ partitions }: { partitions: TopicPartition[] }) {
	const [active, setActive] = useState<TopicPartition | null>(null);
	const colors = leaderColors(partitions);
	const total = partitions.reduce((sum, p) => sum + p.messageCount, 0);

	return (
		<div className="flex flex-wrap items-center gap-6">
			<div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
				<svg
					viewBox={`0 0 ${SIZE} ${SIZE}`}
					width={SIZE}
					height={SIZE}
					role="img"
					aria-label={`${partitions.length} partitions across ${colors.size} ${colors.size === 1 ? "broker" : "brokers"}`}
				>
					<circle
						cx={SIZE / 2}
						cy={SIZE / 2}
						r={RADIUS}
						fill="none"
						stroke="color-mix(in oklab, var(--foreground) 10%, transparent)"
						strokeWidth={STROKE}
					/>
					{partitions.map((p) => (
						<motion.path
							key={p.rangeStart}
							d={arcPath(p.rangeStart, p.rangeStop)}
							fill="none"
							stroke={colors.get(p.leader)}
							strokeWidth={active?.rangeStart === p.rangeStart ? STROKE + 3 : STROKE}
							strokeLinecap="butt"
							initial={false}
							animate={{ opacity: active && active.rangeStart !== p.rangeStart ? 0.35 : 1 }}
							transition={{ duration: 0.15 }}
							onPointerEnter={() => setActive(p)}
							onPointerLeave={() => setActive(null)}
							className="cursor-default"
							data-testid="partition-arc"
						>
							<title>{`Slots ${p.rangeStart}–${p.rangeStop - 1}, led by ${p.leader}`}</title>
						</motion.path>
					))}
				</svg>
				<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
					{active ? (
						<>
							<span className="font-mono text-[11px]">
								{active.rangeStart}–{active.rangeStop - 1}
							</span>
							<span className="metric font-semibold text-[20px] leading-6">
								{formatCount(active.messageCount)}
							</span>
							<span className="text-[11px] text-muted-foreground">{formatBytes(active.totalSize)}</span>
						</>
					) : (
						<>
							<span className="metric font-semibold text-[28px] leading-8">{partitions.length}</span>
							<span className="text-[11px] text-muted-foreground">
								{partitions.length === 1 ? "partition" : "partitions"}
							</span>
							<span className="text-[11px] text-muted-foreground tabular">{formatCount(total)} messages</span>
						</>
					)}
				</div>
			</div>
			<ul className="space-y-2 text-[13px]" aria-label="Partition leaders">
				{[...colors].map(([leader, color]) => (
					<li key={leader} className="flex items-center gap-2">
						<span className="size-2.5 rounded-full" style={{ background: color }} />
						<span className="font-mono text-[12px]">{leader || "Unassigned"}</span>
						<span className="text-[12px] text-muted-foreground tabular">
							{partitions.filter((p) => p.leader === leader).length} led
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}
