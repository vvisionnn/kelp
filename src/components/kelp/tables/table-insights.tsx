import type { IcebergSnapshot, TableDetail, TableSummary } from "@shared/tables.ts";
import { useQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useRef } from "react";
import {
	BarList,
	Columns,
	compact,
	dataColor,
	Kpi,
	splitUnit,
	TimeChart,
} from "@/components/kelp/charts/index.ts";
import { BarsGhost, KPI_TILE } from "@/components/kelp/maintenance/parts.tsx";
import { Panel } from "@/components/kelp/page.tsx";
import { ChartGhost, KpiGhost, LoadingRegion, RowsGhost } from "@/components/kelp/skeletons.tsx";
import { Loaded } from "@/components/kelp/transitions.tsx";
import { formatBytes, formatCount, formatRelative } from "@/lib/format.ts";
import { streamsQueries } from "@/lib/streams-queries.ts";
import { cn } from "@/lib/utils";

const numberOrNull = (value: string | undefined) => {
	if (value === undefined) return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
};

/** One point per snapshot, oldest first: when it landed and the table's totals after it. */
export interface SnapshotPoint {
	t: number;
	id: string;
	operation: string;
	records: number | null;
	addedRecords: number | null;
	dataFiles: number | null;
	bytes: number | null;
}

/** Turns Iceberg snapshot summaries into a growth history, oldest first. */
export function snapshotHistory(snapshots: IcebergSnapshot[]): SnapshotPoint[] {
	return snapshots
		.filter((s) => s.timestamp)
		.map((s) => ({
			t: Date.parse(s.timestamp as string),
			id: s.id,
			operation: s.operation,
			records: numberOrNull(s.summary["total-records"]),
			addedRecords: numberOrNull(s.summary["added-records"]),
			dataFiles: numberOrNull(s.summary["total-data-files"]),
			bytes: numberOrNull(s.summary["total-files-size"]),
		}))
		.sort((a, b) => a.t - b.t);
}

/** How a table grew: records over time beside what each recent commit added. */
export function TableGrowth({ snapshots }: { snapshots: IcebergSnapshot[] }) {
	const history = snapshotHistory(snapshots);
	if (history.length === 0) return null;
	const recent = history.slice(-12);
	return (
		<div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
			<Panel
				title="Records over time"
				description="Total records after each commit"
				className="xl:col-span-8"
			>
				<TimeChart
					times={history.map((p) => p.t)}
					series={[{ label: "Records", color: dataColor(0), values: history.map((p) => p.records) }]}
					mode="area"
					height={200}
					label="Total records after each commit"
					empty="One commit so far; the chart starts with the second."
				/>
			</Panel>
			<Panel title="Recent commits" description="Records each commit added" className="xl:col-span-4">
				<Columns
					height={200}
					color={dataColor(2)}
					label="Records added by recent commits"
					columns={recent.map((p, i) => ({
						label: `#${history.length - recent.length + i + 1}`,
						value: p.addedRecords ?? 0,
					}))}
				/>
			</Panel>
		</div>
	);
}

export interface TableRef {
	bucket: string;
	table: TableSummary;
}

/** Reads every table's metadata (tables are few) and totals what the warehouses hold. */
export function useTableDetails(tables: TableRef[]) {
	const queries = useQueries({
		queries: tables.map(({ bucket, table }) => streamsQueries.table(bucket, table.namespace, table.name)),
	});
	return {
		pending: queries.some((query) => query.isPending),
		details: queries
			.map((query, i) => ({ ref: tables[i] as TableRef, detail: query.data }))
			.filter((entry): entry is { ref: TableRef; detail: TableDetail } => Boolean(entry.detail)),
	};
}

/** Matches `WarehouseDashboard`, tiles and panels both. */
export function DashboardGhost({ wide = false }: { wide?: boolean }) {
	return (
		<div className="mb-6 space-y-3">
			<div
				className={cn("grid grid-cols-2 gap-3 md:grid-cols-3", wide ? "xl:grid-cols-6" : "xl:grid-cols-5")}
			>
				{(wide ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4]).map((i) => (
					<KpiGhost key={i} trend={false} className={KPI_TILE} />
				))}
			</div>
			<div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
				<Panel title="Largest tables" description="By records" className="xl:col-span-7">
					<BarsGhost rows={3} />
				</Panel>
				<Panel title="Latest commits" description="Across every table" className="xl:col-span-5">
					<RowsGhost rows={4} className="space-y-[23px] py-3" />
				</Panel>
			</div>
		</div>
	);
}

/** Matches `TableGrowth`. */
export function GrowthGhost() {
	return (
		<div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
			<Panel
				title="Records over time"
				description="Total records after each commit"
				className="xl:col-span-8"
			>
				<ChartGhost height={200} legend={false} />
			</Panel>
			<Panel title="Recent commits" description="Records each commit added" className="xl:col-span-4">
				<ChartGhost height={200} legend={false} />
			</Panel>
		</div>
	);
}

/** Totals, the largest tables and the latest commits across every warehouse. */
export function WarehouseDashboard({
	warehouses,
	namespaces,
	tables,
	pending = false,
}: {
	/** Shown when the dashboard spans several warehouses. */
	warehouses?: number;
	namespaces: number;
	tables: TableRef[];
	/** The caller is still reading what `tables` should be. */
	pending?: boolean;
}) {
	const { details, pending: reading } = useTableDetails(tables);
	// Only the first read shows ghosts; a table added later must not blank the dashboard.
	const answered = useRef(false);
	if (!pending && !reading) answered.current = true;
	return (
		<Loaded
			query={{ data: answered.current ? details : undefined, error: null }}
			skeleton={
				<LoadingRegion label="Loading warehouse totals">
					<DashboardGhost wide={warehouses !== undefined} />
				</LoadingRegion>
			}
		>
			{(ready) => (
				<WarehouseTotals
					{...(warehouses === undefined ? {} : { warehouses })}
					namespaces={namespaces}
					tables={tables}
					details={ready}
				/>
			)}
		</Loaded>
	);
}

function WarehouseTotals({
	warehouses,
	namespaces,
	tables,
	details,
}: {
	warehouses?: number;
	namespaces: number;
	tables: TableRef[];
	details: Array<{ ref: TableRef; detail: TableDetail }>;
}) {
	const records = details.reduce((sum, d) => sum + (d.detail.iceberg?.metrics.records ?? 0), 0);
	const bytes = details.reduce((sum, d) => sum + (d.detail.iceberg?.metrics.totalSize ?? 0), 0);
	const snapshots = details.flatMap((d) =>
		(d.detail.iceberg?.snapshots ?? []).map((snapshot) => ({ ref: d.ref, snapshot })),
	);
	const largest = [...details]
		.filter((d) => (d.detail.iceberg?.metrics.records ?? 0) > 0)
		.sort((a, b) => (b.detail.iceberg?.metrics.records ?? 0) - (a.detail.iceberg?.metrics.records ?? 0))
		.slice(0, 6);
	const latest = snapshots
		.filter((s) => s.snapshot.timestamp)
		.sort((a, b) => (b.snapshot.timestamp as string).localeCompare(a.snapshot.timestamp as string))
		.slice(0, 6);
	return (
		<div className="mb-6 space-y-3">
			<div
				className={cn(
					"grid grid-cols-2 gap-3 md:grid-cols-3",
					warehouses === undefined ? "xl:grid-cols-5" : "xl:grid-cols-6",
				)}
			>
				{warehouses !== undefined && (
					<Kpi label="Warehouses" value={formatCount(warehouses)} hint="Table buckets" />
				)}
				<Kpi label="Namespaces" value={formatCount(namespaces)} />
				<Kpi
					label="Tables"
					value={formatCount(tables.length)}
					hint={`${tables.filter((t) => t.table.metadataLocation).length} with data`}
				/>
				<Kpi label="Records" value={compact(records)} hint={`${formatCount(records)} in all tables`} />
				<Kpi label="Data size" {...splitUnit(formatBytes(bytes))} hint="Parquet data files" />
				<Kpi label="Commits" value={formatCount(snapshots.length)} hint="Snapshots kept" />
			</div>
			<div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
				<Panel title="Largest tables" description="By records" className="xl:col-span-7">
					<BarList
						label="Tables by records"
						empty="No table has data yet. Engines add it through the catalog."
						items={largest.map(({ ref, detail }) => ({
							key: `${ref.bucket}/${ref.table.namespace}/${ref.table.name}`,
							label: (
								<Link
									to="/tables/$bucket/$namespace/$table"
									params={{ bucket: ref.bucket, namespace: ref.table.namespace, table: ref.table.name }}
									className="font-mono text-[12px] hover:underline"
								>
									{ref.table.namespace}.{ref.table.name}
								</Link>
							),
							value: detail.iceberg?.metrics.records ?? 0,
							display: compact(detail.iceberg?.metrics.records ?? 0),
							extra: (
								<span className="w-16 text-right text-[12px] text-muted-foreground tabular">
									{formatBytes(detail.iceberg?.metrics.totalSize ?? 0)}
								</span>
							),
						}))}
					/>
				</Panel>
				<Panel title="Latest commits" description="Across every table" className="xl:col-span-5">
					{latest.length ? (
						<ul aria-label="Latest commits" className="divide-y divide-border text-[13px]">
							{latest.map(({ ref, snapshot }) => (
								<li key={`${ref.table.arn}-${snapshot.id}`} className="flex items-center gap-3 py-2">
									<span className="w-16 shrink-0 text-[12px] text-muted-foreground">
										{snapshot.operation}
									</span>
									<Link
										to="/tables/$bucket/$namespace/$table"
										params={{ bucket: ref.bucket, namespace: ref.table.namespace, table: ref.table.name }}
										search={{ tab: "snapshots" }}
										className="min-w-0 flex-1 truncate font-mono text-[12px] hover:underline"
									>
										{ref.table.namespace}.{ref.table.name}
									</Link>
									{snapshot.summary["added-records"] && (
										<span className="shrink-0 text-[12px] tabular">
											+{compact(Number(snapshot.summary["added-records"]))}
										</span>
									)}
									<span className="w-20 shrink-0 text-right text-[12px] text-muted-foreground">
										{formatRelative(snapshot.timestamp)}
									</span>
								</li>
							))}
						</ul>
					) : (
						<p className="py-6 text-center text-[13px] text-muted-foreground">No commits yet.</p>
					)}
				</Panel>
			</div>
		</div>
	);
}
