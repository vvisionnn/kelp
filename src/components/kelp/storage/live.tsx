import type { Telemetry, TelemetryRange } from "@shared/telemetry.ts";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { RANGES } from "@/components/kelp/charts/index.ts";
import { Segmented } from "@/components/kelp/controls.tsx";
import { SkeletonBlock } from "@/components/kelp/page.tsx";
import { Swap } from "@/components/kelp/transitions.tsx";
import { queries } from "@/lib/queries.ts";

/** The sampled metrics for a storage page. Its data stays undefined until loaded or when it fails. */
export function useTelemetry(range: TelemetryRange): UseQueryResult<Telemetry> {
	return useQuery(queries.telemetry(range));
}

/**
 * Holds a page's main query back until telemetry has answered too, so tile sparklines and live
 * panels land with the numbers around them. Failed telemetry never blocks the page.
 */
export function withTelemetry<T>(query: UseQueryResult<T>, telemetry: UseQueryResult<Telemetry>) {
	const answered = telemetry.data !== undefined || telemetry.error != null;
	return {
		data: answered ? query.data : undefined,
		error: query.data === undefined ? query.error : null,
		refetch: query.refetch,
	};
}

/** The page's one time range control. Holds its place until telemetry says whether there is one. */
export function RangeControl({
	telemetry,
	range,
	onChange,
}: {
	telemetry: UseQueryResult<Telemetry>;
	range: TelemetryRange;
	onChange: (range: TelemetryRange) => void;
}) {
	const state = telemetry.data?.enabled ? "ranges" : telemetry.isPending ? "pending" : "off";
	return (
		<Swap id={state}>
			{state === "ranges" && (
				<Segmented label="Time range" items={RANGES} value={range} onChange={onChange} />
			)}
			{state === "pending" && <SkeletonBlock className="h-7 w-40 rounded-lg" />}
		</Swap>
	);
}

/** In place of a live chart when SeaweedFS metrics are not being sampled. */
export function MetricsOffNote() {
	return (
		<p className="flex h-full min-h-32 items-center justify-center px-6 text-center text-[13px] text-muted-foreground">
			Live traffic appears here once Kelp samples SeaweedFS's metrics (KELP_METRICS_URLS).
		</p>
	);
}
