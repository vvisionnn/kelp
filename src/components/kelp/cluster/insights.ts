import type { TelemetryPoint, TrafficSample } from "@shared/telemetry.ts";
import { dataColor, type TimeSeries } from "@/components/kelp/charts/index.ts";

/** S3, filer and volume servers as three series of one measure, in fixed colors. */
export function componentSeries(
	points: TelemetryPoint[],
	measure: (t: TrafficSample) => number | null,
): TimeSeries[] {
	return [
		{ label: "S3", color: dataColor(0), values: points.map((p) => measure(p.s3)) },
		{ label: "Filer", color: dataColor(1), values: points.map((p) => measure(p.filer)) },
		{ label: "Volume servers", color: dataColor(2), values: points.map((p) => measure(p.volume)) },
	];
}

/** CPU summed over processes, as cores in use: 166% reads as "1.66 cores", never a percentage past 100. */
export function cores(percent: number): string {
	const value = percent / 100;
	return `${value < 10 ? value.toFixed(2) : value.toFixed(1)} ${value === 1 ? "core" : "cores"}`;
}
