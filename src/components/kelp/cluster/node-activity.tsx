import type { Overview } from "@shared/api.ts";
import type { Telemetry } from "@shared/telemetry.ts";
import {
	dataColor,
	latest,
	millis,
	perSecond,
	Sparkline,
	TimeChart,
} from "@/components/kelp/charts/index.ts";
import { componentSeries, cores } from "@/components/kelp/cluster/insights.ts";
import { CapacityBar, Panel } from "@/components/kelp/page.tsx";
import { MetricsOffNote } from "@/components/kelp/storage/live.tsx";
import { RollingValue, TextMorph } from "@/components/kelp/text-morph.tsx";
import { formatBytes, formatCount } from "@/lib/format.ts";

/** Request rates and latency per component, and what the SeaweedFS processes cost to run. */
export function NodeActivity({
	overview,
	telemetry,
}: {
	overview: Overview;
	telemetry: Telemetry | undefined;
}) {
	const points = telemetry?.points ?? [];
	const times = points.map((p) => p.t);
	const cpu = points.map((p) => p.process.cpuPercent);
	const memory = points.map((p) => p.process.memoryBytes);
	const goroutines = points.map((p) => p.process.goroutines);
	return (
		<>
			<div className="mt-3 grid gap-3 xl:grid-cols-12">
				<Panel title="Requests" description="Per second, by component" className="min-w-0 xl:col-span-8">
					{telemetry?.enabled ? (
						<TimeChart
							times={times}
							series={componentSeries(points, (t) => t.rps)}
							height={200}
							format={perSecond}
							label="Requests per second by component"
						/>
					) : (
						<MetricsOffNote />
					)}
				</Panel>
				<Panel
					title="Processes"
					description="Summed over every SeaweedFS process"
					className="min-w-0 xl:col-span-4"
				>
					<dl className="divide-y divide-border">
						<ProcessStat label="CPU" value={cores(latest(cpu) ?? 0)} trend={cpu} color={dataColor(1)} />
						<ProcessStat
							label="Memory"
							value={formatBytes(latest(memory) ?? 0)}
							trend={memory}
							color={dataColor(3)}
						/>
						<ProcessStat
							label="Goroutines"
							value={formatCount(latest(goroutines) ?? 0)}
							trend={goroutines}
							color={dataColor(2)}
						/>
					</dl>
				</Panel>
			</div>
			<div className="mt-3 grid gap-3 xl:grid-cols-12">
				<Panel title="Latency" description="95th percentile, by component" className="min-w-0 xl:col-span-7">
					{telemetry?.enabled ? (
						<TimeChart
							times={times}
							series={componentSeries(points, (t) => t.p95)}
							height={180}
							format={millis}
							label="95th percentile latency by component"
						/>
					) : (
						<MetricsOffNote />
					)}
				</Panel>
				<Panel
					title="Volume slots"
					description="Volumes each server holds, of its maximum"
					className="min-w-0 xl:col-span-5"
				>
					<ul aria-label="Volume slots by server" className="space-y-3">
						{overview.volumeServers.map((server) => (
							<li key={server.id} className="text-[13px]">
								<div className="flex items-center justify-between gap-3">
									<span className="truncate font-mono">{server.address}</span>
									<span className="shrink-0 text-muted-foreground tabular">
										<TextMorph>{`${formatCount(server.volumes)} of ${formatCount(server.maxVolumes)}`}</TextMorph>
									</span>
								</div>
								<CapacityBar used={server.volumes} total={server.maxVolumes} className="mt-1.5" />
							</li>
						))}
					</ul>
				</Panel>
			</div>
		</>
	);
}

function ProcessStat({
	label,
	value,
	trend,
	color,
}: {
	label: string;
	value: string;
	trend: number[];
	color: string;
}) {
	return (
		<div className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
			<div>
				<dt className="text-[13px] text-muted-foreground">{label}</dt>
				<dd className="font-rounded font-semibold text-[20px] leading-6">
					<RollingValue text={value} />
				</dd>
			</div>
			<Sparkline values={trend} color={color} width={120} height={32} label={`${label} trend`} />
		</div>
	);
}
