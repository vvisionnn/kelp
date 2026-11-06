import type { Overview } from "@shared/api.ts";
import type { Telemetry } from "@shared/telemetry.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity } from "lucide-react";
import {
	BarList,
	Columns,
	compact,
	dataColor,
	hasSeries,
	Kpi,
	latencySeries,
	latest,
	millis,
	perSecond,
	RANGES,
	Ring,
	Sparkline,
	splitUnit,
	TimeChart,
	trafficByType,
	useRange,
} from "@/components/kelp/charts/index.ts";
import { Segmented } from "@/components/kelp/controls.tsx";
import {
	CapacityBar,
	PageHeader,
	Panel,
	Section,
	SkeletonBlock,
	StatusDot,
} from "@/components/kelp/page.tsx";
import {
	ChartGhost,
	KpiGhost,
	ListGhost,
	LoadingRegion,
	RingGhost,
	RowsGhost,
} from "@/components/kelp/skeletons.tsx";
import { RollingValue, TextMorph } from "@/components/kelp/text-morph.tsx";
import { Loaded, Swap } from "@/components/kelp/transitions.tsx";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatCount, formatPercent, formatRelative, plural, ratio } from "@/lib/format.ts";
import { healthSummary } from "@/lib/health.ts";
import { queries } from "@/lib/queries.ts";
import { cores } from "./cluster.tsx";

export const Route = createFileRoute("/_app/")({
	staticData: { title: "Overview" },
	loader: ({ context }) => void context.queryClient.prefetchQuery(queries.overview()),
	component: OverviewPage,
});

export { healthSummary };

function OverviewPage() {
	const [range, setRange] = useRange();
	const overview = useQuery(queries.overview());
	const telemetry = useQuery(queries.telemetry(range));
	const health = overview.data && healthSummary(overview.data);

	return (
		<>
			<PageHeader
				title="Overview"
				description={
					health && overview.data ? (
						<span className="flex flex-wrap items-center gap-x-2">
							<StatusDot tone={health.tone} label={health.text} />
							<span className="text-tertiary">
								<TextMorph>{`Updated ${formatRelative(overview.data.updatedAt)}`}</TextMorph>
							</span>
						</span>
					) : (
						!overview.error && <SkeletonBlock className="my-0.5 h-3.5 w-64 max-w-full" />
					)
				}
				actions={
					<Swap id={telemetry.isPending ? "pending" : telemetry.data?.enabled ? "ranges" : "none"}>
						{telemetry.isPending ? (
							<SkeletonBlock className="h-7 w-[168px] rounded-lg" />
						) : (
							telemetry.data?.enabled && (
								<Segmented label="Time range" items={RANGES} value={range} onChange={setRange} />
							)
						)}
					</Swap>
				}
			/>
			{/* The tiles' trend lines come from telemetry, so the page lands once both have answered. */}
			<Loaded
				query={{
					data: telemetry.data || telemetry.error ? overview.data : undefined,
					error: overview.error,
					refetch: overview.refetch,
				}}
				skeleton={<OverviewSkeleton />}
			>
				{(data) => (
					<>
						<Headline data={data} telemetry={telemetry.data} />
						<Loaded
							query={{ data: telemetry.data, error: telemetry.error, refetch: telemetry.refetch }}
							skeleton={<LiveSkeleton />}
						>
							{(metrics) =>
								metrics.enabled ? (
									<Live data={data} telemetry={metrics} />
								) : (
									<MetricsOff unreachable={metrics.unreachable} />
								)
							}
						</Loaded>
						<Fleet data={data} telemetry={telemetry.data} />
					</>
				)}
			</Loaded>
		</>
	);
}

/** The six numbers an operator checks first, each with its recent trend. */
function Headline({ data, telemetry }: { data: Overview; telemetry: Telemetry | undefined }) {
	const inventory = telemetry?.inventory ?? [];
	const points = telemetry?.points ?? [];
	const diskUsed = data.volumeServers.reduce((sum, s) => sum + s.diskUsage, 0);
	const diskTotal = data.volumeServers.reduce((sum, s) => sum + s.diskCapacity, 0);
	const rps = points.map((p) => p.s3.rps);
	const p95 = points.map((p) => p.s3.p95);
	const errors = points.map((p) => p.s3.clientErrors + p.s3.serverErrors);
	const latestRps = latest(rps) ?? 0;
	const latestErrors = latest(errors) ?? 0;
	const latestP95 = latest(p95);
	const stored = splitUnit(formatBytes(data.totalSize));
	const used = ratio(diskUsed, diskTotal);
	return (
		<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
			<Kpi
				label="Object data"
				{...stored}
				hint={plural(data.totalVolumes, "volume")}
				trend={inventory.map((p) => p.storedBytes)}
				color={dataColor(0)}
			/>
			<Kpi
				label="Files"
				value={compact(data.totalFiles)}
				hint={`${formatCount(data.totalFiles)} in all volumes`}
				trend={inventory.map((p) => p.files)}
				color={dataColor(2)}
			/>
			<Kpi
				label="Disk used"
				value={formatPercent(used).replace("%", "")}
				unit="%"
				hint={`${formatBytes(diskUsed)} of ${formatBytes(diskTotal)}`}
				trend={inventory.map((p) => ratio(p.diskUsedBytes, p.diskTotalBytes) * 100)}
				color={dataColor(1)}
				{...(used >= 0.95 ? { tone: "bad" as const } : used >= 0.8 ? { tone: "warn" as const } : {})}
			/>
			<Kpi
				label="S3 requests"
				value={compact(latestRps)}
				unit="/s"
				hint={telemetry?.enabled ? "Right now" : "Metrics are off"}
				trend={rps}
				color={dataColor(0)}
			/>
			<Kpi
				label="S3 latency, p95"
				{...(latestP95 === null ? { value: "–" } : splitUnit(millis(latestP95)))}
				hint={latestP95 === null ? "No requests in the last interval" : "Slowest 5% take longer"}
				trend={p95}
				color={dataColor(3)}
			/>
			<Kpi
				label="S3 errors"
				value={compact(latestErrors)}
				unit="/s"
				hint={latestErrors > 0 ? "4xx and 5xx responses" : "No failed requests"}
				trend={errors}
				color={dataColor(1)}
				{...(latestErrors > 0 ? { tone: "warn" as const } : {})}
			/>
		</div>
	);
}

/** Traffic, latency, capacity and the busiest buckets, from the sampled metrics. */
function Live({ data, telemetry }: { data: Overview; telemetry: Telemetry }) {
	const times = telemetry.points.map((p) => p.t);
	const ready = hasSeries(telemetry);
	const diskUsed = data.volumeServers.reduce((sum, s) => sum + s.diskUsage, 0);
	const diskTotal = data.volumeServers.reduce((sum, s) => sum + s.diskCapacity, 0);
	const other = Math.max(0, diskUsed - data.totalSize);
	return (
		<>
			<div className="mt-3 grid gap-3 xl:grid-cols-12">
				<Panel
					title="S3 traffic"
					description="Requests per second by request type"
					className="xl:col-span-8"
					actions={<LiveBadge />}
				>
					<TimeChart
						times={times}
						series={trafficByType(telemetry.points, (p) => p.s3)}
						mode="stacked"
						height={220}
						format={perSecond}
						label="S3 requests per second by type"
					/>
				</Panel>
				<Panel title="Capacity" description="What fills the volume servers' disks" className="xl:col-span-4">
					<Ring
						label="Disk used"
						slices={[
							{
								label: "Object data",
								value: data.totalSize,
								color: dataColor(0),
								display: formatBytes(data.totalSize),
							},
							{
								label: "Other files on disk",
								value: other,
								color: dataColor(3),
								display: formatBytes(other),
							},
							{
								label: "Free",
								value: Math.max(0, diskTotal - diskUsed),
								color: "var(--accent)",
								display: formatBytes(Math.max(0, diskTotal - diskUsed)),
							},
						]}
						center={
							<>
								<span className="font-rounded font-semibold text-[24px] leading-7 tracking-[-0.02em]">
									<RollingValue text={formatPercent(ratio(diskUsed, diskTotal))} />
								</span>
								<span className="text-[12px] text-muted-foreground">
									<TextMorph>{`of ${formatBytes(diskTotal)}`}</TextMorph>
								</span>
							</>
						}
					/>
				</Panel>
			</div>

			<div className="mt-3 grid gap-3 xl:grid-cols-12">
				<Panel
					title="S3 latency"
					description="How long requests take, by percentile"
					className="xl:col-span-6"
				>
					<TimeChart
						times={times}
						series={latencySeries(telemetry.points, (p) => p.s3)}
						height={200}
						format={millis}
						label="S3 request latency percentiles"
						empty={ready ? "No S3 requests in this range." : undefined}
					/>
				</Panel>
				<Panel title="Busiest buckets" description="S3 requests in this range" className="xl:col-span-6">
					<BarList
						label="Buckets by S3 requests"
						empty="No bucket has served a request in this range."
						items={telemetry.buckets.slice(0, 6).map((b) => ({
							key: b.bucket,
							label: (
								<Link
									to="/buckets/$bucket"
									params={{ bucket: b.bucket }}
									className="font-mono hover:underline"
								>
									{b.bucket}
								</Link>
							),
							value: b.requests,
							display: compact(b.requests),
							extra: <Sparkline values={b.series} width={64} height={20} label={`${b.bucket} requests`} />,
						}))}
					/>
				</Panel>
			</div>

			<div className="mt-3 grid gap-3 xl:grid-cols-12">
				<Panel title="Volume servers" description="Reads and writes per second" className="xl:col-span-5">
					<TimeChart
						times={times}
						series={[
							{
								label: "Reads",
								color: dataColor(0),
								values: telemetry.points.map((p) => p.volume.byType.GET ?? 0),
							},
							{
								label: "Writes",
								color: dataColor(1),
								values: telemetry.points.map(
									(p) =>
										(p.volume.byType.POST ?? 0) + (p.volume.byType.PUT ?? 0) + (p.volume.byType.DELETE ?? 0),
								),
							},
						]}
						mode="area"
						height={180}
						format={perSecond}
						label="Volume server reads and writes per second"
					/>
				</Panel>
				<Panel title="Filer metadata" description="Store operations per second" className="xl:col-span-4">
					<TimeChart
						times={times}
						series={storeSeries(telemetry)}
						mode="stacked"
						height={180}
						format={perSecond}
						label="Filer store operations per second"
					/>
				</Panel>
				<Panel
					title="Object sizes"
					description="Objects written since the filer started"
					className="xl:col-span-3"
				>
					<Columns
						height={180}
						color={dataColor(2)}
						label="Objects by size"
						columns={sizeColumns(telemetry.objectSizes)}
					/>
				</Panel>
			</div>
		</>
	);
}

/** Store operations by type, busiest three plus "Other". */
function storeSeries(telemetry: Telemetry) {
	const totals = new Map<string, number>();
	for (const p of telemetry.points)
		for (const [type, v] of Object.entries(p.store)) totals.set(type, (totals.get(type) ?? 0) + v);
	const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([type]) => type);
	const named = top.slice(0, 3);
	const series = named.map((type, i) => ({
		label: type,
		color: dataColor(i),
		values: telemetry.points.map((p) => p.store[type] ?? 0),
	}));
	if (top.length > 3)
		series.push({
			label: "Other",
			color: dataColor(4),
			values: telemetry.points.map((p) =>
				Object.entries(p.store)
					.filter(([type]) => !named.includes(type))
					.reduce((sum, [, v]) => sum + v, 0),
			),
		});
	return series;
}

/** Size buckets as labelled columns; the open-ended last bucket reads "larger". */
export function sizeColumns(buckets: Telemetry["objectSizes"]) {
	const finite = buckets.filter((b) => b.le >= 0).sort((a, b) => a.le - b.le);
	const columns = finite.map((b) => ({ label: `≤${formatBytes(b.le).replace(" ", "")}`, value: b.count }));
	const rest = buckets.find((b) => b.le < 0);
	const last = finite.at(-1);
	if (rest && last) columns.push({ label: `>${formatBytes(last.le).replace(" ", "")}`, value: rest.count });
	return columns;
}

function LiveBadge() {
	return (
		<span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
			<Activity className="size-3.5" />
			Live
		</span>
	);
}

/** Shown when Kelp has no metrics endpoint to sample: what is missing and how to turn it on. */
function MetricsOff({ unreachable }: { unreachable: string[] | undefined }) {
	return (
		<div className="group-sheet mt-3 flex flex-col gap-1 p-4 text-[13px]">
			<p className="font-semibold">Live charts are off</p>
			<p className="text-muted-foreground">
				Kelp draws traffic, latency and growth from SeaweedFS's Prometheus metrics. Start SeaweedFS with{" "}
				<code className="font-mono text-foreground">-metricsPort</code> and set{" "}
				<code className="font-mono text-foreground">KELP_METRICS_URLS</code>; the release compose file does
				both.
				{unreachable && unreachable.length > 0 && ` Unreachable: ${unreachable.join(", ")}.`}
			</p>
		</div>
	);
}

/** The machines and services behind the numbers. */
function Fleet({ data, telemetry }: { data: Overview; telemetry: Telemetry | undefined }) {
	const leader = data.masters.find((m) => m.isLeader);
	const process = latest(telemetry?.points.map((p) => p.process) ?? []);
	return (
		<>
			<div className="mt-8 grid items-start gap-x-6 gap-y-8 lg:grid-cols-12">
				<Section
					title="Volume servers"
					className="mt-0 lg:col-span-7"
					actions={
						<Link to="/cluster" className="text-[13px] text-muted-foreground hover:text-foreground">
							All nodes
						</Link>
					}
				>
					<ul className="group-sheet divide-y divide-border">
						{data.volumeServers.map((server) => (
							<li
								key={server.id}
								className="grid items-center gap-x-6 gap-y-2 px-4 py-3 sm:grid-cols-[1fr_18rem]"
							>
								<div className="min-w-0">
									<p className="truncate font-mono text-[13px]">{server.address}</p>
									<p className="text-[12px] text-muted-foreground">
										{server.dataCenter} / {server.rack}, {formatCount(server.volumes)} of{" "}
										{formatCount(server.maxVolumes)} volume slots
									</p>
								</div>
								<div className="flex items-center gap-3">
									<CapacityBar used={server.diskUsage} total={server.diskCapacity} />
									<span className="w-32 shrink-0 text-right text-[12px] text-muted-foreground tabular">
										{formatBytes(server.diskUsage)} / {formatBytes(server.diskCapacity)}
									</span>
								</div>
							</li>
						))}
					</ul>
				</Section>

				<Section title="Services" className="mt-0 lg:col-span-5">
					<dl className="group-sheet divide-y divide-border">
						<ServiceRow label="Masters" count={data.masters.length} detail={leader?.address ?? "no leader"} />
						<ServiceRow label="Filers" count={data.filers.length} detail={data.filers[0]?.address} />
						<ServiceRow
							label="S3 gateways"
							count={data.s3Gateways.length}
							detail={data.s3Gateways[0]?.address}
						/>
						<ServiceRow
							label="Message brokers"
							count={data.brokers.length}
							detail={data.brokers[0]?.address}
						/>
						<ServiceRow
							label="Maintenance workers"
							count={data.maintenance.workers}
							note={`${data.maintenance.tasks} tasks running`}
						/>
					</dl>
					<div className="mt-2 space-y-1 px-4 text-[12px] text-muted-foreground">
						{data.versions.uniform ? (
							<p>
								Every node runs SeaweedFS{" "}
								<span className="font-mono text-foreground">
									{data.versions.version.split(" ")[0] || "unknown"}
								</span>
								.
							</p>
						) : (
							<div>
								<Badge variant="outline" className="border-warning/50 text-warning-foreground">
									Mixed versions
								</Badge>
								<ul className="mt-2 space-y-1">
									{data.versions.groups.map((group) => (
										<li key={group.type}>
											{group.type}:{" "}
											{group.versions.map((v) => `${v.version.split(" ")[0]} (${v.count})`).join(", ")}
										</li>
									))}
								</ul>
							</div>
						)}
						{process && (
							<p>
								SeaweedFS processes use {cores(process.cpuPercent)} and {formatBytes(process.memoryBytes)} of
								memory.
							</p>
						)}
					</div>
				</Section>
			</div>

			{data.tiers.length > 0 && (
				<Section title="Storage tiers" className="mt-8">
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{data.tiers.map((tier) => (
							<div key={tier.name} className="group-sheet p-4">
								<div className="flex items-center justify-between">
									<span className="font-semibold text-[13px]">{tier.name}</span>
									<Badge variant="secondary">{tier.isRemote ? "Remote" : "Local disk"}</Badge>
								</div>
								<p className="mt-1 text-[12px] text-muted-foreground">
									{formatCount(tier.volumeCount)} volumes, {formatCount(tier.ecShardCount)} EC shards,{" "}
									{formatBytes(tier.dataSize)} of data
								</p>
								{!tier.isRemote && (
									<CapacityBar used={tier.diskUsed} total={tier.diskCapacity} className="mt-3" />
								)}
							</div>
						))}
					</div>
				</Section>
			)}
		</>
	);
}

function ServiceRow({
	label,
	count,
	detail,
	note,
}: {
	label: string;
	count: number;
	detail?: string | undefined;
	note?: string;
}) {
	return (
		<div className="flex h-10 items-center justify-between gap-3 px-4 text-[13px]">
			<dt className="flex items-center gap-2">
				<StatusDot tone={count > 0 ? "good" : "idle"} label={label} />
			</dt>
			<dd className="flex min-w-0 items-center gap-2 text-muted-foreground">
				{detail && <span className="truncate font-mono text-xs">{detail}</span>}
				{note && <span className="truncate text-xs">{note}</span>}
				<span className="w-5 text-right font-medium text-foreground tabular">{count}</span>
			</dd>
		</div>
	);
}

function LiveSkeleton() {
	return (
		<div className="mt-3 grid gap-3 xl:grid-cols-12">
			<Panel title="S3 traffic" description="Requests per second by request type" className="xl:col-span-8">
				<ChartGhost height={220} />
			</Panel>
			<Panel title="Capacity" description="What fills the volume servers' disks" className="xl:col-span-4">
				<RingGhost />
			</Panel>
			<Panel title="S3 latency" description="How long requests take, by percentile" className="xl:col-span-6">
				<ChartGhost height={220} />
			</Panel>
			<Panel title="Busiest buckets" description="S3 requests in this range" className="xl:col-span-6">
				<RowsGhost rows={6} />
			</Panel>
		</div>
	);
}

function OverviewSkeleton() {
	return (
		<LoadingRegion label="Loading overview">
			<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
				{[0, 1, 2, 3, 4, 5].map((i) => (
					<KpiGhost key={i} />
				))}
			</div>
			<LiveSkeleton />
			<div className="mt-8 grid items-start gap-x-6 gap-y-8 lg:grid-cols-12">
				<Section title="Volume servers" className="mt-0 lg:col-span-7">
					<ListGhost />
				</Section>
				<Section title="Services" className="mt-0 lg:col-span-5">
					<div className="group-sheet p-4">
						<RowsGhost rows={5} />
					</div>
				</Section>
			</div>
		</LoadingRegion>
	);
}
