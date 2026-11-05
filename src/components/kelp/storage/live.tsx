import type { Telemetry, TelemetryRange } from "@shared/telemetry.ts";
import { useQuery } from "@tanstack/react-query";
import { RANGES } from "@/components/kelp/charts/index.ts";
import { Segmented } from "@/components/kelp/controls.tsx";
import { queries } from "@/lib/queries.ts";

/** The sampled metrics for a storage page; undefined until loaded or when the request fails. */
export function useTelemetry(range: TelemetryRange): Telemetry | undefined {
	return useQuery(queries.telemetry(range)).data;
}

/** The page's one time range control. Hidden when there are no live metrics to scope. */
export function RangeControl({
	telemetry,
	range,
	onChange,
}: {
	telemetry: Telemetry | undefined;
	range: TelemetryRange;
	onChange: (range: TelemetryRange) => void;
}) {
	if (!telemetry?.enabled) return null;
	return <Segmented label="Time range" items={RANGES} value={range} onChange={onChange} />;
}

/** In place of a live chart when SeaweedFS metrics are not being sampled. */
export function MetricsOffNote() {
	return (
		<p className="flex h-full min-h-32 items-center justify-center px-6 text-center text-[13px] text-muted-foreground">
			Live traffic appears here once Kelp samples SeaweedFS's metrics (KELP_METRICS_URLS).
		</p>
	);
}
