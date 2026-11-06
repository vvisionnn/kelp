import type { DataFileInfo, IcebergSnapshot, IcebergTable, TableDetail } from "@shared/tables.ts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Camera, Database, Rows3, Trash2 } from "lucide-react";
import { BarList, compact, dataColor, Kpi, splitUnit } from "@/components/kelp/charts/index.ts";
import { ConfirmDialog } from "@/components/kelp/confirm-dialog.tsx";
import { CopyButton } from "@/components/kelp/copy-button.tsx";
import { Collapse, KPI_TILE } from "@/components/kelp/maintenance/parts.tsx";
import { EmptyState, PageHeader, Panel, SkeletonBlock } from "@/components/kelp/page.tsx";
import { KpiGhost, LoadingRegion, RowsGhost } from "@/components/kelp/skeletons.tsx";
import { PolicyEditor } from "@/components/kelp/tables/policy-editor.tsx";
import { SchemaTree } from "@/components/kelp/tables/schema-tree.tsx";
import { GrowthGhost, snapshotHistory, TableGrowth } from "@/components/kelp/tables/table-insights.tsx";
import { TagsEditor } from "@/components/kelp/tables/tags-editor.tsx";
import { TextMorph } from "@/components/kelp/text-morph.tsx";
import { Loaded, Swap } from "@/components/kelp/transitions.tsx";
import { Alert, AlertDescription } from "@/components/reui/alert";
import {
	Timeline,
	TimelineContent,
	TimelineDate,
	TimelineHeader,
	TimelineIndicator,
	TimelineItem,
	TimelineSeparator,
	TimelineTitle,
} from "@/components/reui/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api.ts";
import { formatBytes, formatCount, formatDateTime, formatRelative } from "@/lib/format.ts";
import { useAction } from "@/lib/mutations.ts";
import { oneOf, text } from "@/lib/search.ts";
import { useCanWrite } from "@/lib/session.ts";
import { streamsQueries, tablePath } from "@/lib/streams-queries.ts";
import { cn } from "@/lib/utils";

const TABS = ["schema", "data", "snapshots", "details", "access"] as const;
type Tab = (typeof TABS)[number];

export const Route = createFileRoute("/_app/tables/$bucket/$namespace/$table")({
	staticData: {
		section: "Object store",
		title: "Tables",
		crumb: ({ bucket, namespace, table }) => `${bucket} / ${namespace}.${table}`,
	},
	validateSearch: (
		raw: Record<string, unknown>,
	): { tab?: (typeof TABS)[number]; snapshot?: string; file?: string } => ({
		tab: oneOf(raw.tab, TABS),
		snapshot: text(raw.snapshot),
		file: text(raw.file),
	}),
	loader: ({ context, params }) => {
		// Prefetch without blocking: the page renders at once and its skeleton gives way to data.
		void context.queryClient.prefetchQuery(
			streamsQueries.table(params.bucket, params.namespace, params.table),
		);
	},
	component: TablePage,
});

/** Whether the bucket page, if it was the way here, already said this table has no commits. */
function useKnownEmpty() {
	const { bucket, namespace, table } = Route.useParams();
	const cached = useQueryClient().getQueryData(streamsQueries.tableBucket(bucket).queryKey);
	const summary = cached?.tables.find((t) => t.namespace === namespace && t.name === table);
	return summary !== undefined && !summary.metadataLocation;
}

function TablePage() {
	const { bucket, namespace, table } = Route.useParams();
	const query = useQuery(streamsQueries.table(bucket, namespace, table));
	const { data, isPending } = query;
	const canWrite = useCanWrite();
	const partition = data?.iceberg?.partition ?? [];
	const knownEmpty = useKnownEmpty();
	return (
		<>
			<PageHeader
				title={`${namespace}.${table}`}
				description={
					// A phone wraps the partition phrase onto a second line; hold room for it either way.
					<span className="block max-sm:min-h-9">
						An Iceberg table in <span className="font-mono">{bucket}</span>, namespace{" "}
						<span className="font-mono">{namespace}</span>
						{partition.length > 0 && (
							<>
								, partitioned by{" "}
								<TextMorph className="font-mono">{partition.map((p) => p.sourceName).join(", ")}</TextMorph>
							</>
						)}
						{isPending && !knownEmpty && (
							<SkeletonBlock className="ml-1 inline-block h-3 w-40 align-middle" />
						)}
						.
					</span>
				}
				actions={
					canWrite && (
						<Swap id={data ? "delete" : isPending ? "loading" : "none"}>
							{data ? (
								<DeleteTable bucket={bucket} namespace={namespace} table={table} />
							) : (
								isPending && <SkeletonBlock className="h-8 w-28" />
							)}
						</Swap>
					)
				}
			/>
			<Loaded query={query} skeleton={<TableSkeleton />}>
				{(detail) => <TableBody detail={detail} />}
			</Loaded>
		</>
	);
}

function TableBody({ detail }: { detail: TableDetail }) {
	const { tab = "schema" } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const iceberg = detail.iceberg;
	return (
		<div className="space-y-6">
			{detail.metadataError && (
				<Alert variant="warning">
					<AlertDescription>{detail.metadataError}</AlertDescription>
				</Alert>
			)}
			<TableHero detail={detail} />
			<Tabs
				value={tab}
				className="pt-2"
				onValueChange={(value) => navigate({ search: (s) => ({ ...s, tab: value as Tab }) })}
			>
				<TabsList className="mb-4 max-w-full justify-start overflow-x-auto">
					<TabsTrigger value="schema">Schema</TabsTrigger>
					<TabsTrigger value="data">Data</TabsTrigger>
					<TabsTrigger value="snapshots">Snapshots</TabsTrigger>
					<TabsTrigger value="details">Details</TabsTrigger>
					<TabsTrigger value="access">Access</TabsTrigger>
				</TabsList>
				<Swap id={tab}>
					<TabsContent value={tab}>
						{tab === "schema" ? (
							<SchemaTab iceberg={iceberg} />
						) : tab === "data" ? (
							<DataTab detail={detail} />
						) : tab === "snapshots" ? (
							<SnapshotsTab iceberg={iceberg} />
						) : tab === "details" ? (
							<DetailsTab detail={detail} />
						) : (
							<AccessTab detail={detail} />
						)}
					</TabsContent>
				</Swap>
			</Tabs>
		</div>
	);
}

/** The table at a glance: its size and history as numbers, then how it grew commit by commit. */
function TableHero({ detail }: { detail: TableDetail }) {
	const iceberg = detail.iceberg;
	const metrics = iceberg?.metrics;
	const snapshots = iceberg?.snapshots ?? [];
	const history = snapshotHistory(snapshots);
	const last = history.at(-1);
	return (
		<div className="space-y-3">
			<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
				<Kpi
					label="Records"
					value={compact(metrics?.records ?? 0)}
					hint={
						(metrics?.records ?? 0) >= 1000
							? `${formatCount(metrics?.records ?? 0)} rows`
							: "In the current snapshot"
					}
					trend={history.map((p) => p.records)}
					color={dataColor(0)}
				/>
				<Kpi
					label="Data size"
					{...splitUnit(formatBytes(metrics?.totalSize ?? 0))}
					trend={history.map((p) => p.bytes)}
					color={dataColor(3)}
				/>
				<Kpi
					label="Data files"
					value={formatCount(metrics?.dataFiles ?? 0)}
					hint={metrics?.deleteFiles ? `${formatCount(metrics.deleteFiles)} delete files` : "No delete files"}
				/>
				<Kpi label="Snapshots" value={formatCount(snapshots.length)} hint="Kept for time travel" />
				<Kpi
					label="Columns"
					value={formatCount(iceberg?.fields.length ?? 0)}
					hint={
						iceberg?.schemaCount
							? `${iceberg.schemaCount} schema ${iceberg.schemaCount === 1 ? "version" : "versions"}`
							: undefined
					}
				/>
				<Kpi
					label="Last commit"
					{...(last ? splitUnit(formatRelative(new Date(last.t).toISOString())) : { value: "None" })}
					hint={
						last
							? `${last.operation}${last.addedRecords ? `, +${compact(last.addedRecords)} records` : ""}`
							: "No engine has written yet"
					}
				/>
			</div>
			<TableGrowth snapshots={snapshots} />
		</div>
	);
}

function SchemaTab({ iceberg }: { iceberg: IcebergTable | null }) {
	if (!iceberg) {
		return (
			<EmptyState
				icon={<Database />}
				title="No schema yet"
				description="Engines define the schema when they first write to this table."
			/>
		);
	}
	return (
		<div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
			<Panel
				title="Columns"
				description={
					iceberg.schemaCount > 1
						? `Schema ${iceberg.schemaId ?? ""} of ${iceberg.schemaCount}. The table's schema has evolved.`
						: "Column ids stay stable when columns are renamed."
				}
			>
				<SchemaTree fields={iceberg.fields} />
			</Panel>
			<div className="space-y-3">
				<Panel title="Partitioning" description="How rows are split into files.">
					{iceberg.partition.length ? (
						<ul className="space-y-2 text-sm">
							{iceberg.partition.map((p) => (
								<li key={`${p.name}-${p.fieldId}`} className="flex items-center justify-between gap-2">
									<span className="font-mono">{p.sourceName}</span>
									<Badge variant="outline" className="font-mono">
										{p.transform}
									</Badge>
								</li>
							))}
						</ul>
					) : (
						<p className="text-muted-foreground text-sm">Not partitioned.</p>
					)}
				</Panel>
				<Panel title="Sort order">
					{iceberg.sortOrder.length ? (
						<ul className="space-y-2 text-sm">
							{iceberg.sortOrder.map((s) => (
								<li key={s.sourceName} className="flex items-center justify-between gap-2">
									<span className="font-mono">{s.sourceName}</span>
									<span className="text-muted-foreground text-xs">
										{s.direction}, {s.nullOrder.replace("-", " ")}
									</span>
								</li>
							))}
						</ul>
					) : (
						<p className="text-muted-foreground text-sm">Unsorted.</p>
					)}
				</Panel>
			</div>
		</div>
	);
}

function DataTab({ detail }: { detail: TableDetail }) {
	const { bucket, namespace, table } = Route.useParams();
	const { snapshot, file } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const snapshots = detail.iceberg?.snapshots ?? [];
	const preview = useQuery({
		...streamsQueries.preview(bucket, namespace, table, {
			...(snapshot ? { snapshot } : {}),
			...(file ? { file } : {}),
		}),
		enabled: snapshots.length > 0,
	});

	if (!snapshots.length) {
		return (
			<EmptyState
				icon={<Rows3 />}
				title="No data yet"
				description="Rows appear here once an engine commits its first snapshot."
			/>
		);
	}
	const select = (patch: { snapshot?: string | undefined; file?: string | undefined }) =>
		navigate({ search: (s) => ({ ...s, ...patch }) });

	const partitions = preview.data ? recordsByPartition(preview.data.files) : [];
	return (
		<div className="space-y-4">
			<Collapse open={partitions.length > 1}>
				<Panel title="Records by partition" description="In the chosen snapshot's data files">
					<BarList
						label="Records by partition"
						color={dataColor(0)}
						items={partitions.slice(0, 8).map((p) => ({
							key: p.partition,
							label: <span className="font-mono text-[12px]">{p.partition}</span>,
							value: p.records,
							display: compact(p.records),
							extra: (
								<span className="w-16 text-right text-[12px] text-muted-foreground tabular">
									{formatBytes(p.bytes)}
								</span>
							),
						}))}
					/>
				</Panel>
			</Collapse>
			<div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[20rem_1fr]">
				<Panel title="Files" description="Live data files in the chosen snapshot.">
					<div className="mb-3 grid gap-1 text-xs">
						<label htmlFor="preview-snapshot" className="text-muted-foreground">
							Snapshot
						</label>
						<Select
							value={snapshot ?? detail.iceberg?.currentSnapshotId ?? ""}
							onValueChange={(value) => select({ snapshot: value as string, file: undefined })}
						>
							<SelectTrigger id="preview-snapshot" aria-label="Snapshot" className="w-full font-mono">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{snapshots.map((s) => (
									<SelectItem key={s.id} value={s.id} className="font-mono">
										{s.id} {s.current ? "(current)" : ""}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					{/* The Rows panel reports a failed preview; this one just stays empty. */}
					<Loaded
						query={{ data: preview.data ?? (preview.error ? null : undefined), error: null }}
						skeleton={<SkeletonBlock className="h-40" />}
					>
						{(ready) =>
							ready && (
								<FileList
									files={ready.files}
									selected={ready.file}
									onSelect={(path) => select({ file: path })}
								/>
							)
						}
					</Loaded>
				</Panel>
				<Panel
					title="Rows"
					description={
						preview.data?.file ? (
							<span className="break-all font-mono">{preview.data.file.split("/").pop()}</span>
						) : (
							"First rows of the selected file."
						)
					}
					actions={
						<span
							className={cn(
								"tide h-1 w-16 rounded-full bg-accent transition-opacity",
								!preview.isPlaceholderData && "opacity-0",
							)}
						/>
					}
				>
					<Loaded query={preview} skeleton={<RowsGhost rows={8} />}>
						{(ready) => (
							<Swap id={ready.file ?? "none"}>
								{ready.notes.map((note) => (
									<p key={note} className="mb-2 text-muted-foreground text-sm">
										{note}
									</p>
								))}
								{ready.rows.length > 0 && <RowsGrid columns={ready.columns} rows={ready.rows} />}
							</Swap>
						)}
					</Loaded>
				</Panel>
			</div>
		</div>
	);
}

/** Records and bytes per partition value, largest first, from a snapshot's data files. */
export function recordsByPartition(files: DataFileInfo[]) {
	const groups = new Map<string, { records: number; bytes: number }>();
	for (const file of files) {
		const key =
			Object.entries(file.partition)
				.map(([name, value]) => `${name}=${value ?? "null"}`)
				.join(", ") || "unpartitioned";
		const current = groups.get(key) ?? { records: 0, bytes: 0 };
		groups.set(key, { records: current.records + file.records, bytes: current.bytes + file.size });
	}
	return [...groups].map(([partition, v]) => ({ partition, ...v })).sort((a, b) => b.records - a.records);
}

function FileList({
	files,
	selected,
	onSelect,
}: {
	files: DataFileInfo[];
	selected: string | null;
	onSelect: (path: string) => void;
}) {
	if (!files.length) return <p className="text-muted-foreground text-sm">No data files.</p>;
	return (
		<ul className="max-h-[28rem] space-y-1 overflow-y-auto" aria-label="Data files">
			{files.map((f) => {
				const partition = Object.entries(f.partition);
				return (
					<li key={f.path}>
						<button
							type="button"
							onClick={() => onSelect(f.path)}
							aria-current={f.path === selected}
							className={cn(
								"w-full rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-raised",
								f.path === selected && "bg-primary/10 ring-1 ring-primary/40 ring-inset hover:bg-primary/15",
							)}
						>
							<span className="block truncate font-mono text-xs">{f.path.split("/").pop()}</span>
							<span className="mt-1 flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
								{partition.map(([key, value]) => (
									<Badge key={key} variant="outline" className="font-mono">
										{key}={value ?? "null"}
									</Badge>
								))}
								<span className="tabular">{formatCount(f.records)} rows</span>
								<span className="tabular">{formatBytes(f.size)}</span>
							</span>
						</button>
					</li>
				);
			})}
		</ul>
	);
}

function RowsGrid({ columns, rows }: { columns: string[]; rows: Array<Array<string | null>> }) {
	return (
		<div className="-mx-4 -mb-4 max-h-[32rem] overflow-auto">
			<table className="w-full text-[13px]">
				<thead className="sticky top-0 bg-card">
					<tr className="border-border border-b">
						{columns.map((c) => (
							<th
								key={c}
								className="whitespace-nowrap px-4 py-2 text-left font-medium font-mono text-[12px] text-muted-foreground"
							>
								{c}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((row, index) => (
						<tr
							// biome-ignore lint/suspicious/noArrayIndexKey: preview rows have no identity; order is fixed.
							key={index}
							className="border-border border-b transition-colors last:border-0 hover:bg-raised/70"
						>
							{row.map((value, column) => (
								<td
									// biome-ignore lint/suspicious/noArrayIndexKey: cells are positional.
									key={column}
									className={cn(
										"whitespace-nowrap px-4 py-2 font-mono text-[12px]",
										value === null && "text-muted-foreground",
									)}
								>
									{value ?? "null"}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

const SUMMARY_LABELS: Array<[string, string, (v: number) => string]> = [
	["added-records", "rows added", formatCount],
	["deleted-records", "rows deleted", formatCount],
	["added-data-files", "files added", formatCount],
	["deleted-data-files", "files removed", formatCount],
	["added-files-size", "written", formatBytes],
];

/** The headline numbers of a snapshot summary, skipping zeros. */
export function snapshotHighlights(snapshot: IcebergSnapshot): string[] {
	return SUMMARY_LABELS.flatMap(([key, label, format]) => {
		const value = Number(snapshot.summary[key] ?? 0);
		return value > 0 ? [`${format(value)} ${label}`] : [];
	});
}

function SnapshotsTab({ iceberg }: { iceberg: IcebergTable | null }) {
	const navigate = useNavigate({ from: Route.fullPath });
	const snapshots = iceberg?.snapshots ?? [];
	if (!snapshots.length) {
		return (
			<EmptyState
				icon={<Camera />}
				title="No snapshots yet"
				description="Each commit by an engine adds a snapshot you can travel back to."
			/>
		);
	}
	return (
		<Panel
			title="History"
			description="Newest first. Every snapshot is a complete, queryable version of the table."
		>
			<Timeline value={snapshots.length} className="mt-2">
				{snapshots.map((snapshot, index) => (
					<TimelineItem key={snapshot.id} step={snapshots.length - index}>
						<TimelineHeader>
							<TimelineSeparator />
							<TimelineDate>
								{formatDateTime(snapshot.timestamp)} ({formatRelative(snapshot.timestamp)})
							</TimelineDate>
							<TimelineTitle className="flex flex-wrap items-center gap-2">
								<span className="capitalize">{snapshot.operation}</span>
								<span className="font-mono text-muted-foreground text-xs">{snapshot.id}</span>
								{snapshot.current && <Badge variant="area">current</Badge>}
							</TimelineTitle>
							<TimelineIndicator />
						</TimelineHeader>
						<TimelineContent className="flex flex-wrap items-center gap-x-4 gap-y-1">
							{snapshotHighlights(snapshot).map((h) => (
								<span key={h} className="tabular">
									{h}
								</span>
							))}
							<span className="tabular">
								{formatCount(Number(snapshot.summary["total-records"] ?? 0))} rows in total
							</span>
							<Button
								variant="link"
								size="xs"
								className="px-0"
								onClick={() =>
									navigate({ search: (s) => ({ ...s, tab: "data", snapshot: snapshot.id, file: undefined }) })
								}
							>
								Browse this version
							</Button>
						</TimelineContent>
					</TimelineItem>
				))}
			</Timeline>
		</Panel>
	);
}

function DetailsTab({ detail }: { detail: TableDetail }) {
	const iceberg = detail.iceberg;
	/** [label, value, code-like] — code-like values are mono and copyable. */
	const rows: Array<[string, string | null, boolean]> = [
		["Location", iceberg?.location ?? null, true],
		["Metadata file", detail.table.metadataLocation, true],
		["Table UUID", iceberg?.uuid ?? null, true],
		["ARN", detail.table.arn, true],
		["Format version", iceberg?.formatVersion ? `Iceberg v${iceberg.formatVersion}` : null, false],
		["Owner", detail.owner || null, false],
		["Created", formatDateTime(detail.table.createdAt), false],
		["Last updated", iceberg?.lastUpdated ? formatDateTime(iceberg.lastUpdated) : null, false],
	];
	const properties = Object.entries(iceberg?.properties ?? {}).sort(([a], [b]) => a.localeCompare(b));
	return (
		<div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
			<Panel title="Table">
				<dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
					{rows
						.filter(([, value]) => value)
						.map(([label, value, code]) => (
							<div key={label} className="contents">
								<dt className="text-muted-foreground">{label}</dt>
								<dd className={cn("flex min-w-0 items-start gap-1 break-all", code && "font-mono text-xs")}>
									{value}
									{code && <CopyButton value={value as string} label={`Copy ${label.toLowerCase()}`} />}
								</dd>
							</div>
						))}
				</dl>
			</Panel>
			<div className="space-y-3">
				<Panel title="Properties">
					{properties.length ? (
						<dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
							{properties.map(([key, value]) => (
								<div key={key} className="contents">
									<dt className="break-all font-mono text-muted-foreground">{key}</dt>
									<dd className="break-all font-mono">{value}</dd>
								</div>
							))}
						</dl>
					) : (
						<p className="text-muted-foreground text-sm">No properties.</p>
					)}
				</Panel>
				{iceberg && iceberg.refs.length > 0 && (
					<Panel title="Branches and tags">
						<ul className="space-y-2 text-sm">
							{iceberg.refs.map((ref) => (
								<li key={ref.name} className="flex items-center justify-between gap-2">
									<span className="flex items-center gap-2">
										<span className="font-mono">{ref.name}</span>
										<Badge variant="outline">{ref.type}</Badge>
									</span>
									<span className="font-mono text-muted-foreground text-xs">{ref.snapshotId}</span>
								</li>
							))}
						</ul>
					</Panel>
				)}
				{iceberg && iceberg.metadataLog.length > 0 && (
					<Panel title="Earlier metadata files">
						<ul className="space-y-1.5 text-xs">
							{iceberg.metadataLog.map((entry) => (
								<li key={entry.file} className="flex items-center justify-between gap-3">
									<span className="truncate font-mono">{entry.file.split("/").pop()}</span>
									<span className="shrink-0 text-muted-foreground">{formatRelative(entry.timestamp)}</span>
								</li>
							))}
						</ul>
					</Panel>
				)}
			</div>
		</div>
	);
}

function AccessTab({ detail }: { detail: TableDetail }) {
	const canWrite = useCanWrite();
	const { bucket, namespace, table } = Route.useParams();
	const path = tablePath(bucket, namespace, table);
	const invalidate = [["tables", "table", bucket, namespace, table]];
	const saveTags = useAction({
		run: (tags: Record<string, string>) => api.put(`${path}/tags`, { tags }),
		success: "Tags saved",
		invalidate,
	});
	const savePolicy = useAction({
		run: (policy: string) => api.put(`${path}/policy`, { policy }),
		success: "Table policy saved",
		invalidate,
	});
	const removePolicy = useAction({
		run: () => api.delete(`${path}/policy`),
		success: "Table policy removed",
		invalidate,
	});
	return (
		<div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
			<Panel title="Table policy" description="Applies to this table on top of the bucket policy.">
				<PolicyEditor
					policy={detail.policy}
					resource={detail.table.arn}
					canEdit={canWrite}
					onSave={(policy) => savePolicy.mutateAsync(policy)}
					onRemove={() => removePolicy.mutateAsync()}
				/>
			</Panel>
			<Panel title="Tags">
				<TagsEditor tags={detail.tags} canEdit={canWrite} onSave={(tags) => saveTags.mutateAsync(tags)} />
			</Panel>
		</div>
	);
}

function DeleteTable({ bucket, namespace, table }: { bucket: string; namespace: string; table: string }) {
	const navigate = useNavigate();
	const remove = useAction({
		run: () => api.delete(tablePath(bucket, namespace, table)),
		success: `Table ${namespace}.${table} deleted`,
		invalidate: [["tables", "bucket", bucket]],
		onSuccess: () => navigate({ to: "/tables/$bucket", params: { bucket } }),
	});
	return (
		<ConfirmDialog
			trigger={
				<Button variant="destructive">
					<Trash2 />
					Delete table
				</Button>
			}
			title={`Delete table ${namespace}.${table}?`}
			description="The catalog forgets this table and SeaweedFS removes its metadata and data files. This cannot be undone."
			confirmLabel="Delete table"
			destructive
			typeToConfirm={table}
			onConfirm={() => remove.mutateAsync()}
		/>
	);
}

function TableSkeleton() {
	const { tab = "schema" } = Route.useSearch();
	const knownEmpty = useKnownEmpty();
	return (
		<LoadingRegion label="Loading table" className="space-y-6">
			<div className="space-y-3">
				<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
					{[0, 1, 2, 3, 4, 5].map((i) => (
						<KpiGhost key={i} trend={i < 2 && !knownEmpty} className={KPI_TILE} />
					))}
				</div>
				{!knownEmpty && <GrowthGhost />}
			</div>
			<div className="flex flex-col gap-2 pt-2">
				<SkeletonBlock className="mb-4 h-8 w-80 max-w-full" />
				{tab === "schema" ? (
					<div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
						<Panel title="Columns">
							<RowsGhost rows={6} />
						</Panel>
						<div className="space-y-3">
							<Panel title="Partitioning" description="How rows are split into files.">
								<RowsGhost rows={1} />
							</Panel>
							<Panel title="Sort order">
								<RowsGhost rows={1} />
							</Panel>
						</div>
					</div>
				) : (
					<SkeletonBlock className="h-80 rounded-xl" />
				)}
			</div>
		</LoadingRegion>
	);
}
