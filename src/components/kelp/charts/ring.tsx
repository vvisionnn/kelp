import { arc, pie } from "d3-shape";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";
import { useTween } from "../motion.ts";
import { Legend } from "./legend.tsx";

export interface RingSlice {
	label: string;
	value: number;
	color: string;
	display: string;
}

/**
 * A ring for part-to-whole with a handful of parts (capacity, shares). The center carries the
 * headline; hovering or focusing a slice shows its value there. Slices are separated by a 2px
 * surface gap; a legend with values always sits beside it.
 */
export function Ring({
	slices,
	size = 168,
	thickness = 16,
	center,
	label,
	className,
}: {
	slices: RingSlice[];
	size?: number;
	thickness?: number;
	/** The headline in the middle when nothing is hovered. */
	center: ReactNode;
	label: string;
	className?: string;
}) {
	const [active, setActive] = useState<number | null>(null);
	const radius = size / 2;
	const glided = useTween(
		slices.map((s) => s.value),
		{ intro: true },
	);
	const total = slices.reduce((sum, s) => sum + s.value, 0);
	// While the ring sweeps in, the gap to the full total stays empty.
	const remainder = Math.max(0, total - glided.reduce((sum, v) => sum + v, 0));
	const arcs = pie<RingSlice>()
		.sort(null)
		.value((s) => glided[slices.indexOf(s)] ?? s.value)
		.padAngle(slices.filter((s) => s.value > 0).length > 1 ? 0.02 : 0)
		.endAngle(2 * Math.PI * (total ? 1 - remainder / total : 1))(slices);
	const shape = arc<(typeof arcs)[number]>()
		.innerRadius(radius - thickness)
		.outerRadius(radius)
		.cornerRadius(3);
	const hovered = active === null ? null : slices[active];
	return (
		<div className={cn("flex flex-wrap items-center gap-6", className)}>
			<div className="relative shrink-0" style={{ width: size, height: size }}>
				<svg role="img" aria-label={label} width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
					<circle
						cx={radius}
						cy={radius}
						r={radius - thickness / 2}
						fill="none"
						stroke="var(--accent)"
						strokeWidth={thickness}
					/>
					<g transform={`translate(${radius},${radius})`}>
						{arcs.map((a, i) =>
							a.data.value > 0 ? (
								// biome-ignore lint/a11y/useSemanticElements: an SVG slice cannot be a button; it is focusable for keyboard readout.
								<path
									key={a.data.label}
									d={shape(a) ?? ""}
									fill={a.data.color}
									role="button"
									tabIndex={0}
									aria-label={`${a.data.label}: ${a.data.display}`}
									onPointerEnter={() => setActive(i)}
									onPointerLeave={() => setActive(null)}
									onFocus={() => setActive(i)}
									onBlur={() => setActive(null)}
									className="outline-none transition-opacity focus-visible:opacity-80"
									opacity={active === null || active === i ? 1 : 0.45}
								/>
							) : null,
						)}
					</g>
				</svg>
				<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
					{hovered ? (
						<>
							<span className="font-semibold text-[20px] leading-6 tracking-[-0.015em]">
								{hovered.display}
							</span>
							<span className="text-[12px] text-muted-foreground">{hovered.label}</span>
						</>
					) : (
						center
					)}
				</div>
			</div>
			<Legend
				className="flex-col items-start gap-y-2"
				items={slices.map((s) => ({ label: s.label, color: s.color, value: s.display }))}
			/>
		</div>
	);
}
