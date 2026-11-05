import type { Telemetry, TelemetryPoint, TelemetryRange, TrafficSample } from "@shared/telemetry.ts";
import { useState } from "react";
import type { TimeSeries } from "./time-chart.tsx";

export const RANGES: Array<{ value: TelemetryRange; label: string }> = [
	{ value: "15m", label: "15m" },
	{ value: "1h", label: "1h" },
	{ value: "6h", label: "6h" },
	{ value: "24h", label: "24h" },
];

/** The time range a page's charts share; one control in the page header scopes all of them. */
export function useRange(initial: TelemetryRange = "1h") {
	return useState<TelemetryRange>(initial);
}

const COLORS = ["var(--data-1)", "var(--data-2)", "var(--data-3)", "var(--data-4)", "var(--data-5)"];

/** The nth data palette color, in the fixed order (never cycled past five; fold extras into Other). */
export function dataColor(index: number): string {
	return COLORS[Math.min(index, COLORS.length - 1)] as string;
}

/**
 * Requests per second split by request type, the busiest four as their own series and the rest
 * folded into "Other", so colors stay stable and never exceed the palette.
 */
export function trafficByType(
	points: TelemetryPoint[],
	pick: (p: TelemetryPoint) => TrafficSample,
): TimeSeries[] {
	const totals = new Map<string, number>();
	for (const point of points) {
		for (const [type, rps] of Object.entries(pick(point).byType))
			totals.set(type, (totals.get(type) ?? 0) + rps);
	}
	const ranked = [...totals.entries()].filter(([, total]) => total > 0).sort((a, b) => b[1] - a[1]);
	const top = ranked.slice(0, 4).map(([type]) => type);
	const series: TimeSeries[] = top.map((type, i) => ({
		label: type,
		color: dataColor(i),
		values: points.map((p) => pick(p).byType[type] ?? 0),
	}));
	if (ranked.length > 4) {
		series.push({
			label: "Other",
			color: dataColor(4),
			values: points.map((p) =>
				Object.entries(pick(p).byType)
					.filter(([type]) => !top.includes(type))
					.reduce((sum, [, rps]) => sum + rps, 0),
			),
		});
	}
	return series;
}

/** Latency percentiles as three lines. */
export function latencySeries(
	points: TelemetryPoint[],
	pick: (p: TelemetryPoint) => TrafficSample,
): TimeSeries[] {
	return [
		{ label: "p50", color: dataColor(0), values: points.map((p) => pick(p).p50) },
		{ label: "p95", color: dataColor(1), values: points.map((p) => pick(p).p95) },
		{ label: "p99", color: dataColor(3), values: points.map((p) => pick(p).p99) },
	];
}

/** The most recent value of a series, skipping gaps. */
export function latest<T>(values: Array<T | null>): T | null {
	for (let i = values.length - 1; i >= 0; i--) {
		const value = values[i];
		if (value !== null && value !== undefined) return value;
	}
	return null;
}

/** True when telemetry is on and has at least two points to draw. */
export function hasSeries(telemetry: Telemetry | undefined): telemetry is Telemetry {
	return Boolean(telemetry?.enabled && telemetry.points.length > 1);
}
