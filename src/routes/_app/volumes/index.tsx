import type { StorageInventory } from "@shared/storage.ts";
import type { Telemetry } from "@shared/telemetry.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
	BarList,
	Columns,
	compact,
	dataColor,
	Kpi,
	latest,
	perSecond,
	Ring,
	splitUnit,
	TimeChart,
	useRange,
} from "@/components/kelp/charts/index.ts";
import { PageHeader, Panel } from "@/components/kelp/page.tsx";
import { LoadingRegion } from "@/components/kelp/skeletons.tsx";
import { GrowVolumesDialog, VacuumClusterDialog } from "@/components/kelp/storage/cluster-actions.tsx";
import {
	BarsGhost,
	ColumnsGhost,
	DescriptionGhost,
	Frozen,
	KpiRowGhost,
	PlotGhost,
	RingLegendGhost,
} from "@/components/kelp/storage/common.tsx";
import {
	collectionSlices,
	fillColumns,
	garbageBars,
	hotVolumes,
	lastWriteColumns,
	reads,
	volumesSummary,
	volumeTraffic,
	writes,
} from "@/components/kelp/storage/insights.ts";
import {
	MetricsOffNote,
	RangeControl,
	useTelemetry,
	withTelemetry,
} from "@/components/kelp/storage/live.tsx";
import { VolumeTable } from "@/components/kelp/storage/volume-table.tsx";
import { RollingValue } from "@/components/kelp/text-morph.tsx";
import { Loaded, Swap } from "@/components/kelp/transitions.tsx";
import { formatBytes, formatCount, formatPercent, plural, ratio } from "@/lib/format.ts";
import { oneOf } from "@/lib/search.ts";
import { useCanWrite } from "@/lib/session.ts";
import { storageQueries, VACUUM_THRESHOLD, volumeHealth } from "@/lib/storage-queries.ts";

const FILTERS = ["all", "attention", "read-only", "vacuum"] as const;

export const Route = createFileRoute("/_app/volumes/")({
	staticData: { section: "Storage", title: "Volumes" },
	validateSearch: (raw: Record<string, unknown>): { filter?: (typeof FILTERS)[number] } => ({
		filter: oneOf(raw.filter, FILTERS),
	}),
	loader: ({ context }) => void context.queryClient.prefetchQuery(storageQueries.inventory()),
	component: VolumesPage,
});

function VolumesPage() {
	const { filter } = Route.useSearch();
	const canWrite = useCanWrite();
	const [range, setRange] = useRange();
	const inventory = useQuery(storageQueries.inventory());
	const telemetry = useTelemetry(range);
	const summary = inventory.data && volumesSummary(inventory.data);

	return (
		<>
			<PageHeader
				title="Volumes"
				description={
					<Swap id={summary ?? (inventory.error ? "error" : "pending")}>
						{summary ?? (inventory.error ? "Where your data lives." : <DescriptionGhost wraps />)}
					</Swap>
				}
				actions={
					<>
						<RangeControl telemetry={telemetry} range={range} onChange={setRange} />
						{canWrite && (
							<>
								<VacuumClusterDialog inventory={inventory.data} />
								<GrowVolumesDialog inventory={inventory.data} />
							</>
						)}
					</>
				}
			/>
			<Loaded query={withTelemetry(inventory, telemetry)} skeleton={<VolumesSkeleton />}>
				{(data) => (
					<>
						<VolumeNumbers inventory={data} telemetry={telemetry.data} />
						<Swap id={data.volumes.length > 0 ? "charts" : "none"}>
							{data.volumes.length > 0 && <VolumeCharts inventory={data} telemetry={telemetry.data} />}
						</Swap>
						<div className="mt-8">
							<VolumeTable volumes={data.volumes} {...(filter ? { initialFilter: filter } : {})} />
						</div>
					</>
				)}
			</Loaded>
		</>
	);
}

/** Six numbers about the fleet, each with its trend where Kelp has one. */
function VolumeNumbers({
	inventory,
	telemetry,
}: {
	inventory: StorageInventory;
	telemetry: Telemetry | undefined;
}) {
	const volumes = inventory.volumes;
	const stored = volumes.reduce((sum, v) => sum + v.size, 0);
	const garbage = volumes.reduce((sum, v) => sum + v.deletedBytes, 0);
	const needsVacuum = volumes.filter((v) => v.garbageRatio >= VACUUM_THRESHOLD).length;
	const attention = volumes.filter((v) => volumeHealth(v).tone !== "good").length;
	const readOnly = volumes.filter((v) => v.readOnly).length;
	const freeSlots = inventory.disks.reduce((sum, d) => sum + d.freeVolumeCount, 0);
	const growth = telemetry?.inventory ?? [];
	const points = telemetry?.points ?? [];
	const readRates = points.map(reads);
	const writeRates = points.map(writes);
	return (
		<div className="grid grid-cols-2 gap-3 max-sm:[&_section_svg]:hidden md:grid-cols-3 xl:grid-cols-6">
			<Kpi
				label="Volumes"
				value={formatCount(volumes.length)}
				hint={`${formatCount(freeSlots)} free slots`}
				trend={growth.map((p) => p.volumes)}
			/>
			<Kpi
				label="Stored"
				{...splitUnit(formatBytes(stored))}
				hint={plural(inventory.totals.files, "file")}
				trend={growth.map((p) => p.storedBytes)}
				color={dataColor(2)}
			/>
			<Kpi
				label="Reclaimable"
				{...splitUnit(formatBytes(garbage))}
				hint={
					needsVacuum > 0
						? `${needsVacuum} ${needsVacuum === 1 ? "volume needs" : "volumes need"} a vacuum`
						: `${formatPercent(ratio(garbage, stored))} of stored bytes`
				}
				{...(needsVacuum > 0 ? { tone: "warn" as const } : {})}
			/>
			<Kpi
				label="Needs attention"
				value={formatCount(attention)}
				hint={`${needsVacuum} need a vacuum, ${readOnly} read-only`}
				{...(volumes.some((v) => volumeHealth(v).tone === "bad") ? { tone: "bad" as const } : {})}
			/>
			<Kpi
				label="Reads"
				value={compact(latest(readRates) ?? 0)}
				unit="/s"
				hint={telemetry?.enabled ? "On volume servers, now" : "Metrics are off"}
				trend={readRates}
			/>
			<Kpi
				label="Writes"
				value={compact(latest(writeRates) ?? 0)}
				unit="/s"
				hint={`${plural(hotVolumes(volumes), "volume")} written today`}
				trend={writeRates}
				color={dataColor(1)}
			/>
		</div>
	);
}

/** How the fleet fills, where it is busy, and where a vacuum would pay off. */
function VolumeCharts({
	inventory,
	telemetry,
}: {
	inventory: StorageInventory;
	telemetry: Telemetry | undefined;
}) {
	const navigate = useNavigate();
	const slices = collectionSlices(inventory.collections);
	const stored = inventory.volumes.reduce((sum, v) => sum + v.size, 0);
	return (
		<>
			<div className="mt-3 grid gap-3 xl:grid-cols-12">
				<Panel
					title="Volume server traffic"
					description="Reads and writes per second"
					className="min-w-0 xl:col-span-8"
				>
					{telemetry?.enabled ? (
						<TimeChart
							times={telemetry.points.map((p) => p.t)}
							series={volumeTraffic(telemetry.points)}
							mode="area"
							height={200}
							format={perSecond}
							label="Volume server reads and writes per second"
						/>
					) : (
						<MetricsOffNote />
					)}
				</Panel>
				<Panel
					title="Fill"
					description={`Volumes by how full they are, of ${formatBytes(inventory.volumeSizeLimitBytes)}`}
					className="min-w-0 xl:col-span-4"
				>
					<Columns
						height={200}
						color={dataColor(0)}
						label="Volumes by fill level"
						format={formatCount}
						columns={fillColumns(inventory.volumes)}
					/>
				</Panel>
			</div>
			<div className="mt-3 grid gap-3 xl:grid-cols-12">
				<Panel
					title="By collection"
					description="Where the stored bytes are"
					className="min-w-0 xl:col-span-5"
				>
					<Ring
						label="Stored bytes by collection"
						size={144}
						thickness={14}
						slices={slices}
						center={
							<>
								<span className="font-rounded font-semibold text-[20px] leading-6">
									<RollingValue text={formatBytes(stored)} />
								</span>
								<span className="text-[12px] text-muted-foreground">stored</span>
							</>
						}
					/>
				</Panel>
				<Panel
					title="Last write"
					description="Hot volumes take data; cold ones only serve it"
					className="min-w-0 xl:col-span-4"
				>
					<Columns
						height={160}
						color={dataColor(2)}
						label="Volumes by time since their last write"
						format={formatCount}
						columns={lastWriteColumns(inventory.volumes)}
					/>
				</Panel>
				<Panel
					title="Most garbage"
					description="Where a vacuum frees the most"
					className="min-w-0 xl:col-span-3"
				>
					<BarList
						label="Volumes with the most reclaimable bytes"
						color={dataColor(1)}
						empty="No volume has reclaimable bytes."
						items={garbageBars(inventory.volumes, 5).map((item) => ({
							...item,
							label: (
								<button
									type="button"
									className="text-left hover:underline"
									onClick={() =>
										navigate({ to: "/volumes/$volumeId", params: { volumeId: String(item.id) } })
									}
								>
									{item.label}
								</button>
							),
						}))}
					/>
				</Panel>
			</div>
		</>
	);
}

function VolumesSkeleton() {
	return (
		<LoadingRegion label="Loading storage">
			<KpiRowGhost />
			<div className="mt-3 grid gap-3 xl:grid-cols-12">
				<Panel
					title="Volume server traffic"
					description="Reads and writes per second"
					className="min-w-0 xl:col-span-8"
				>
					<PlotGhost height={200} />
				</Panel>
				<Panel title="Fill" description="Volumes by how full they are" className="min-w-0 xl:col-span-4">
					<ColumnsGhost height={200} />
				</Panel>
			</div>
			<div className="mt-3 grid gap-3 xl:grid-cols-12">
				<Panel
					title="By collection"
					description="Where the stored bytes are"
					className="min-w-0 xl:col-span-5"
				>
					<RingLegendGhost size={144} rows={5} />
				</Panel>
				<Panel
					title="Last write"
					description="Hot volumes take data; cold ones only serve it"
					className="min-w-0 xl:col-span-4"
				>
					<ColumnsGhost height={160} count={5} />
				</Panel>
				<Panel
					title="Most garbage"
					description="Where a vacuum frees the most"
					className="min-w-0 xl:col-span-3"
				>
					<BarsGhost rows={5} />
				</Panel>
			</div>
			<div className="mt-8">
				<Frozen>
					<VolumeTable volumes={undefined} isLoading />
				</Frozen>
			</div>
		</LoadingRegion>
	);
}
