import type { Bucket } from "@shared/objects.ts";
import type { Telemetry } from "@shared/telemetry.ts";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
	BarList,
	Columns,
	compact,
	dataColor,
	Kpi,
	latest,
	perSecond,
	Ring,
	Sparkline,
	splitUnit,
	TimeChart,
	trafficByType,
} from "@/components/kelp/charts/index.ts";
import { CapacityBar, Panel, SkeletonBlock } from "@/components/kelp/page.tsx";
import { ChartGhost, KpiGhost, LoadingRegion, RowsGhost } from "@/components/kelp/skeletons.tsx";
import { RollingValue, TextMorph } from "@/components/kelp/text-morph.tsx";
import { formatBytes, formatCount, formatDateTime, formatPercent } from "@/lib/format.ts";
import { cn } from "@/lib/utils";
import { errorShare, nearQuota, quotaUsage, sizeColumns, sizeShares } from "./insights.ts";

/**
 * The buckets page at a glance: totals and live S3 traffic, where the bytes are, which buckets
 * are busy and which are close to their quota.
 */
export function BucketsDashboard({ buckets, telemetry }: { buckets: Bucket[]; telemetry: Telemetry | null }) {
	const live = Boolean(telemetry?.enabled);
	const points = telemetry?.points ?? [];
	const inventory = telemetry?.inventory ?? [];
	const total = buckets.reduce((sum, b) => sum + b.logicalSize, 0);
	const onDisk = buckets.reduce((sum, b) => sum + b.physicalSize, 0);
	const files = buckets.reduce((sum, b) => sum + (b.storedFiles ?? 0), 0);
	const rps = points.map((p) => p.s3.rps);
	const errors = errorShare(points);
	const latestErrors = latest(errors);
	const near = nearQuota(buckets);
	const quotas = quotaUsage(buckets);
	const shares = sizeShares(buckets);
	const names = new Set(buckets.map((b) => b.name));
	return (
		<div className="mb-8 space-y-3">
			<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
				<Kpi
					label="Object data"
					{...splitUnit(formatBytes(total))}
					hint={`${formatBytes(onDisk)} with copies`}
					trend={inventory.map((p) => p.storedBytes)}
					color={dataColor(0)}
				/>
				<Kpi label="Buckets" value={formatCount(buckets.length)} hint={`${quotas.length} with a quota`} />
				<Kpi
					label="Stored files"
					value={compact(files)}
					hint={`${formatCount(files)} across buckets`}
					trend={inventory.map((p) => p.files)}
					color={dataColor(2)}
				/>
				<Kpi
					label="S3 requests"
					value={live ? compact(latest(rps) ?? 0) : "–"}
					{...(live ? { unit: "/s" } : {})}
					hint={live ? "Right now, all buckets" : "Live metrics are off"}
					trend={rps}
					color={dataColor(0)}
				/>
				<Kpi
					label="Failed requests"
					value={latestErrors === null ? "–" : formatPercent(latestErrors).replace("%", "")}
					{...(latestErrors === null ? {} : { unit: "%" })}
					hint={latestErrors === null ? "No requests right now" : "4xx and 5xx"}
					trend={errors.map((e) => (e === null ? null : e * 100))}
					color={dataColor(1)}
					{...(latestErrors !== null && latestErrors >= 0.05 ? { tone: "warn" as const } : {})}
				/>
				<Kpi
					label="Near quota"
					value={formatCount(near)}
					hint={near > 0 ? "At 80% or more" : "None is close"}
					{...(near > 0 ? { tone: "warn" as const } : {})}
				/>
			</div>

			{live && telemetry && (
				<div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
					<Panel
						title="S3 traffic"
						description="Requests per second by request type"
						className="xl:col-span-8"
					>
						<TimeChart
							times={points.map((p) => p.t)}
							series={trafficByType(points, (p) => p.s3)}
							mode="stacked"
							height={220}
							format={perSecond}
							label="S3 requests per second by type"
						/>
					</Panel>
					<Panel title="Busiest buckets" description="Requests in this range" className="xl:col-span-4">
						<BarList
							label="Buckets by S3 requests"
							empty="No bucket has served a request in this range."
							items={telemetry.buckets
								.filter((b) => names.has(b.bucket))
								.slice(0, 6)
								.map((b) => ({
									key: b.bucket,
									label: (
										<Link
											to="/buckets/$bucket"
											params={{ bucket: b.bucket }}
											className="font-mono text-[12px] hover:underline"
										>
											{b.bucket}
										</Link>
									),
									value: b.requests,
									display: compact(b.requests),
									extra: (
										<Sparkline values={b.series} width={56} height={18} label={`${b.bucket} requests`} />
									),
								}))}
						/>
					</Panel>
				</div>
			)}

			<div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
				<Panel title="Where the data is" description="Object data per bucket" className="xl:col-span-5">
					{shares.length > 0 ? (
						<Ring
							label="Object data per bucket"
							size={148}
							thickness={14}
							slices={shares.map((share, i) => ({
								label: share.label,
								value: share.value,
								color: dataColor(i),
								display: formatBytes(share.value),
							}))}
							center={
								<>
									<span className="font-rounded font-semibold text-[20px] leading-6 tracking-[-0.015em]">
										<RollingValue text={formatBytes(total)} />
									</span>
									<span className="text-[12px] text-muted-foreground">
										<TextMorph>{`in ${buckets.length} buckets`}</TextMorph>
									</span>
								</>
							}
						/>
					) : (
						<p className="py-6 text-center text-[13px] text-muted-foreground">No bucket holds data yet.</p>
					)}
				</Panel>
				<Panel title="Quotas" description="Buckets with a quota, fullest first" className="xl:col-span-4">
					{quotas.length > 0 ? (
						<ul aria-label="Quota usage" className="space-y-3">
							{quotas.slice(0, 5).map(({ bucket, used }) => (
								<li key={bucket.name} className="text-[13px]">
									<div className="mb-1 flex items-baseline justify-between gap-3">
										<Link
											to="/buckets/$bucket"
											params={{ bucket: bucket.name }}
											className="truncate font-mono text-[12px] hover:underline"
										>
											{bucket.name}
										</Link>
										<span className="shrink-0 text-[12px] text-muted-foreground tabular">
											{formatPercent(used)} of {formatBytes(bucket.quota.bytes)}
										</span>
									</div>
									<CapacityBar used={bucket.logicalSize} total={bucket.quota.bytes} />
								</li>
							))}
						</ul>
					) : (
						<p className="py-6 text-center text-[13px] text-muted-foreground">
							No bucket has a quota. Set one in a bucket's settings.
						</p>
					)}
				</Panel>
				<Panel
					title="Object sizes"
					description="Objects written since the filer started"
					className="xl:col-span-3"
				>
					{live && telemetry && telemetry.objectSizes.length > 0 ? (
						<Columns
							height={168}
							color={dataColor(2)}
							label="Objects by size"
							columns={sizeColumns(telemetry.objectSizes)}
						/>
					) : (
						<p className="py-6 text-center text-[13px] text-muted-foreground">
							Appears once live metrics are on.
						</p>
					)}
				</Panel>
			</div>
		</div>
	);
}

/** Stands where `BucketsDashboard` lands, assuming live metrics, which is the usual case. */
export function BucketsDashboardGhost() {
	return (
		<div className="mb-8 space-y-3">
			<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
				{[true, false, true, true, true, false].map((trend, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: ghosts have no identity.
					<KpiGhost key={i} trend={trend} />
				))}
			</div>
			<div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
				<Panel title="S3 traffic" description="Requests per second by request type" className="xl:col-span-8">
					<ChartGhost height={220} />
				</Panel>
				<Panel title="Busiest buckets" description="Requests in this range" className="xl:col-span-4">
					<RowsGhost rows={6} />
				</Panel>
			</div>
			<div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
				<Panel title="Where the data is" description="Object data per bucket" className="xl:col-span-5">
					<div className="flex items-center gap-6">
						<SkeletonBlock className="size-[148px] shrink-0 rounded-full" />
						<RowsGhost rows={5} className="min-w-0 flex-1" />
					</div>
				</Panel>
				<Panel title="Quotas" description="Buckets with a quota, fullest first" className="xl:col-span-4">
					<RowsGhost rows={4} className="space-y-7" />
				</Panel>
				<Panel
					title="Object sizes"
					description="Objects written since the filer started"
					className="xl:col-span-3"
				>
					<SkeletonBlock className="h-[168px] rounded-md" />
				</Panel>
			</div>
		</div>
	);
}

/** Requests per second for one bucket, at each point of the range. */
function bucketSeries(telemetry: Telemetry, bucket: string): Array<number | null> {
	const found = telemetry.buckets.find((b) => b.bucket === bucket);
	return found ? found.series : telemetry.points.map(() => 0);
}

/**
 * One bucket at a glance: how busy it is, how often requests fail, how full it is and everything
 * that governs it.
 */
export function BucketDashboard({ bucket, telemetry }: { bucket: Bucket; telemetry: Telemetry | null }) {
	const live = Boolean(telemetry?.enabled);
	const traffic = telemetry?.buckets.find((b) => b.bucket === bucket.name);
	const series = live && telemetry ? bucketSeries(telemetry, bucket.name) : [];
	const failed = traffic && traffic.requests > 0 ? traffic.errors / traffic.requests : null;
	const quota = bucket.quota.enabled && bucket.quota.bytes > 0;
	const copies = bucket.logicalSize > 0 ? bucket.physicalSize / bucket.logicalSize : null;
	return (
		<div className="mb-8 space-y-3">
			<div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
				<Kpi
					label="Requests"
					value={live ? compact(traffic?.requests ?? 0) : "–"}
					hint={live ? `${perSecond(traffic?.rps ?? 0)} right now` : "Live metrics are off"}
					trend={series}
					color={dataColor(0)}
				/>
				<Kpi
					label="Failed requests"
					value={live ? compact(traffic?.errors ?? 0) : "–"}
					hint={failed === null ? "No requests in this range" : `${formatPercent(failed)} of requests`}
					{...(traffic && traffic.errors > 0 ? { tone: "warn" as const } : {})}
				/>
				<Kpi
					label={quota ? "Quota used" : "Object data"}
					{...(quota
						? { value: formatPercent(bucket.logicalSize / bucket.quota.bytes).replace("%", ""), unit: "%" }
						: splitUnit(formatBytes(bucket.logicalSize)))}
					hint={
						quota
							? `${formatBytes(bucket.logicalSize)} of ${formatBytes(bucket.quota.bytes)}`
							: "No quota. Set one in Settings."
					}
					{...(quota && bucket.logicalSize / bucket.quota.bytes >= 0.8 ? { tone: "warn" as const } : {})}
				/>
				<Kpi
					label="Stored files"
					value={bucket.storedFiles === null ? "–" : compact(bucket.storedFiles)}
					hint={`In ${formatCount(bucket.volumes)} ${bucket.volumes === 1 ? "volume" : "volumes"}`}
				/>
			</div>
			<div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-12">
				{live && telemetry && (
					<Panel
						title="Traffic"
						description="S3 requests per second to this bucket"
						className="xl:col-span-8"
					>
						<TimeChart
							times={telemetry.points.map((p) => p.t)}
							series={[{ label: "Requests", color: dataColor(0), values: series }]}
							mode="area"
							height={200}
							format={perSecond}
							label={`S3 requests per second to ${bucket.name}`}
						/>
					</Panel>
				)}
				<dl
					aria-label="Bucket details"
					className={cn(
						"group-sheet divide-y divide-border text-[13px]",
						live ? "xl:col-span-4" : "xl:col-span-12",
					)}
				>
					<Detail label="Owner">
						{bucket.owner ? (
							<span className="font-mono text-[12px]">{bucket.owner}</span>
						) : (
							<span className="text-muted-foreground">Admins only</span>
						)}
					</Detail>
					<Detail label="Address">
						<span className="font-mono text-[12px]">s3://{bucket.name}</span>
					</Detail>
					<Detail label="Created">{formatDateTime(bucket.createdAt)}</Detail>
					<Detail label="On disk">
						{formatBytes(bucket.physicalSize)}
						{copies !== null && copies > 1.05 && (
							<span className="text-muted-foreground"> ({copies.toFixed(1)}× the data)</span>
						)}
					</Detail>
					<Detail label="Versioning">{bucket.versioning === "Off" ? "Off" : bucket.versioning}</Detail>
					<Detail label="Object lock">
						{bucket.objectLock.enabled
							? `${bucket.objectLock.mode?.toLowerCase() ?? "on"}${bucket.objectLock.retentionDays ? `, ${bucket.objectLock.retentionDays} days` : ""}`
							: "Off"}
					</Detail>
					<Detail label="Lifecycle">
						<TextMorph>
							{bucket.lifecycle.rules
								? `${bucket.lifecycle.enabled} of ${bucket.lifecycle.rules} rules active`
								: "No rules"}
						</TextMorph>
					</Detail>
					<Detail label="Policy">
						<TextMorph>
							{bucket.policyStatements
								? `${bucket.policyStatements} ${bucket.policyStatements === 1 ? "statement" : "statements"}`
								: "None"}
						</TextMorph>
					</Detail>
					{/* Every bucket has this row, so the sheet is one height before and after it loads. */}
					<Detail label="Quota">
						{quota ? (
							<CapacityBar className="w-32" used={bucket.logicalSize} total={bucket.quota.bytes} />
						) : (
							<span className="text-muted-foreground">No limit</span>
						)}
					</Detail>
				</dl>
			</div>
		</div>
	);
}

const DETAILS = [
	"Owner",
	"Address",
	"Created",
	"On disk",
	"Versioning",
	"Object lock",
	"Lifecycle",
	"Policy",
	"Quota",
];

/** Stands where `BucketDashboard` lands, assuming live metrics, which is the usual case. */
export function BucketDashboardGhost() {
	return (
		<LoadingRegion label="Loading bucket" className="mb-8 space-y-3">
			<div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
				{[true, false, false, false].map((trend, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: ghosts have no identity.
					<KpiGhost key={i} trend={trend} />
				))}
			</div>
			<div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-12">
				<Panel title="Traffic" description="S3 requests per second to this bucket" className="xl:col-span-8">
					<ChartGhost height={200} legend={false} />
				</Panel>
				<div className="group-sheet divide-y divide-border text-[13px] xl:col-span-4">
					{DETAILS.map((label) => (
						<div key={label} className="flex min-h-10 items-center justify-between gap-4 px-4 py-2">
							<span className="shrink-0 text-muted-foreground">{label}</span>
							<SkeletonBlock className="h-3.5 w-24" />
						</div>
					))}
				</div>
			</div>
		</LoadingRegion>
	);
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex min-h-10 items-center justify-between gap-4 px-4 py-2">
			<dt className="shrink-0 text-muted-foreground">{label}</dt>
			<dd className="min-w-0 truncate text-right">{children}</dd>
		</div>
	);
}
