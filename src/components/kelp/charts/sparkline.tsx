import { area, line } from "d3-shape";
import { motion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/utils";
import { EASE, SPEED, usePrefersReducedMotion, useTween } from "../motion.ts";

/**
 * A word-sized trend: a 2px line over a faint wash, ending in a dot. For stat tiles; the tile's
 * number carries the value, so the sparkline has no axis or tooltip.
 */
export function Sparkline({
	values,
	color = "var(--data-1)",
	width = 120,
	height = 32,
	className,
	label,
}: {
	values: Array<number | null>;
	color?: string;
	width?: number;
	height?: number;
	className?: string;
	/** Describes the trend for screen readers, e.g. "S3 requests over the last hour". */
	label: string;
}) {
	const gradient = useId();
	const reduced = usePrefersReducedMotion();
	const glided = useTween(values.map((v) => v ?? 0));
	const points = values
		.map((v, i) => [i, v === null ? null : (glided[i] as number)] as const)
		.filter((p): p is readonly [number, number] => p[1] !== null);
	if (points.length < 2) {
		return <svg role="img" aria-label={label} width={width} height={height} className={className} />;
	}
	const max = Math.max(...points.map((p) => p[1]));
	const min = Math.min(0, ...points.map((p) => p[1]));
	const pad = 3;
	const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
	const y = (v: number) => height - pad - ((v - min) / (max - min || 1)) * (height - pad * 2);
	const path = line<readonly [number, number]>()
		.x((p) => x(p[0]))
		.y((p) => y(p[1]))(points);
	const fill = area<readonly [number, number]>()
		.x((p) => x(p[0]))
		.y0(height)
		.y1((p) => y(p[1]))(points);
	const last = points[points.length - 1] as readonly [number, number];
	return (
		<svg
			role="img"
			aria-label={label}
			width={width}
			height={height}
			viewBox={`0 0 ${width} ${height}`}
			className={cn("overflow-visible", className)}
		>
			<defs>
				<linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
					<stop offset="0" stopColor={color} stopOpacity="0.22" />
					<stop offset="1" stopColor={color} stopOpacity="0" />
				</linearGradient>
			</defs>
			<motion.path
				d={fill ?? ""}
				fill={`url(#${gradient})`}
				initial={reduced ? false : { opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: SPEED.data, ease: EASE, delay: 0.2 }}
			/>
			<motion.path
				d={path ?? ""}
				fill="none"
				stroke={color}
				strokeWidth={2}
				strokeLinecap="round"
				strokeLinejoin="round"
				initial={reduced ? false : { pathLength: 0 }}
				animate={{ pathLength: 1 }}
				transition={{ duration: SPEED.data, ease: EASE }}
			/>
			<circle cx={x(last[0])} cy={y(last[1])} r={3} fill={color} stroke="var(--card)" strokeWidth={2} />
		</svg>
	);
}
