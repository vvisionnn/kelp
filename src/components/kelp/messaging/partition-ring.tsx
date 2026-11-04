import type { TopicPartition } from "@shared/messaging.ts";
import { motion } from "motion/react";
import { useState } from "react";
import { formatBytes, formatCount } from "@/lib/format.ts";
import { usePrefersReducedMotion } from "../motion.ts";

const RING = 2520;
/** Categorical hues in fixed order; a broker keeps its color as long as it leads. */
const HUES = ["var(--data-1)", "var(--data-2)", "var(--data-3)", "var(--data-4)", "var(--data-5)"];
const SIZE = 240;
const RADIUS = 100;
const STROKE = 18;
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
	const reduced = usePrefersReducedMotion();
	const [active, setActive] = useState<TopicPartition | null>(null);
	const colors = leaderColors(partitions);
	const total = partitions.reduce((sum, p) => sum + p.messageCount, 0);

	return (
		<div className="flex flex-wrap items-center gap-8">
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
					{partitions.map((p, index) => (
						<motion.path
							key={p.rangeStart}
							d={arcPath(p.rangeStart, p.rangeStop)}
							fill="none"
							stroke={colors.get(p.leader)}
							strokeWidth={active?.rangeStart === p.rangeStart ? STROKE + 4 : STROKE}
							strokeLinecap="butt"
							initial={reduced ? false : { pathLength: 0, opacity: 0 }}
							animate={{ pathLength: 1, opacity: active && active.rangeStart !== p.rangeStart ? 0.35 : 1 }}
							transition={{
								duration: reduced ? 0 : 0.7,
								delay: reduced ? 0 : index * 0.06,
								ease: [0.22, 1, 0.36, 1],
							}}
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
							<span className="font-mono text-xs">
								{active.rangeStart}–{active.rangeStop - 1}
							</span>
							<span className="mt-1 font-[450] text-3xl leading-none tracking-[-0.03em] tabular">
								{formatCount(active.messageCount)}
							</span>
							<span className="mt-1 text-foreground/70 text-xs">{formatBytes(active.totalSize)}</span>
						</>
					) : (
						<>
							<span className="font-[450] text-5xl leading-none tracking-[-0.04em] tabular">
								{partitions.length}
							</span>
							<span className="mt-1.5 text-foreground/70 text-xs">
								{partitions.length === 1 ? "partition" : "partitions"}
							</span>
							<span className="mt-0.5 text-foreground/70 text-xs tabular">{formatCount(total)} messages</span>
						</>
					)}
				</div>
			</div>
			<ul className="space-y-2.5 text-sm" aria-label="Partition leaders">
				{[...colors].map(([leader, color]) => (
					<li key={leader} className="flex items-center gap-2">
						<span className="size-2.5 rounded-full" style={{ background: color }} />
						<span className="font-mono text-xs">{leader || "Unassigned"}</span>
						<span className="text-foreground/70 text-xs tabular">
							{partitions.filter((p) => p.leader === leader).length} led
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}
