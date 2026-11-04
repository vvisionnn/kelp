import type { DataFileInfo, IcebergSnapshot, IcebergTable, TableDetail } from "@shared/tables.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Camera, Database, Rows3, Trash2 } from "lucide-react";
import { z } from "zod";
import { ConfirmDialog } from "@/components/kelp/confirm-dialog.tsx";
import { CopyButton } from "@/components/kelp/copy-button.tsx";
import { BackPill, Facts } from "@/components/kelp/objects/showcase.tsx";
import {
	AuroraCard,
	EmptyState,
	ErrorState,
	Metric,
	PageHeader,
	Panel,
	Reveal,
	SkeletonBlock,
} from "@/components/kelp/page.tsx";
import { PolicyEditor } from "@/components/kelp/tables/policy-editor.tsx";
import { SchemaTree } from "@/components/kelp/tables/schema-tree.tsx";
import { TagsEditor } from "@/components/kelp/tables/tags-editor.tsx";
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
	validateSearch: z.object({
		tab: z.enum(TABS).optional(),
		snapshot: z.string().optional(),
		file: z.string().optional(),
	}),
	loader: ({ context, params }) => {
		// Prefetch without blocking: the page renders at once and its skeleton gives way to data.
		void context.queryClient.prefetchQuery(
			streamsQueries.table(params.bucket, params.namespace, params.table),
		);
	},
	component: TablePage,
});

function TablePage() {
	const { bucket, namespace, table } = Route.useParams();
	const { data, isPending, error, refetch } = useQuery(streamsQueries.table(bucket, namespace, table));
	const canWrite = useCanWrite();
	return (
		<>
			<BackPill to="/tables/$bucket" params={{ bucket }}>
				<span className="font-mono">{bucket}</span>
			</BackPill>
			<PageHeader
				title={`${namespace}.${table}`}
				description={`An Iceberg table in the ${namespace} namespace.`}
				actions={
					canWrite && data ? <DeleteTable bucket={bucket} namespace={namespace} table={table} /> : null
				}
			/>
			{isPending ? (
				<div className="space-y-6" role="status" aria-label="Loading table">
					<div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
						<SkeletonBlock className="h-72 rounded-2xl" />
						<SkeletonBlock className="h-72 rounded-lg" />
					</div>
					<SkeletonBlock className="h-80 rounded-lg" />
				</div>
			) : error ? (
				<ErrorState error={error} onRetry={() => refetch()} />
			) : (
				<TableBody detail={data} />
			)}
		</>
	);
}

function TableBody({ detail }: { detail: TableDetail }) {
	const { tab = "schema" } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const iceberg = detail.iceberg;
	return (
		<Reveal className="space-y-6">
			{detail.metadataError && (
				<Alert variant="warning">
					<AlertDescription>{detail.metadataError}</AlertDescription>
				</Alert>
			)}
			<TableHero detail={detail} />
			<Tabs
				value={tab}
				className="pt-6"
				onValueChange={(value) => navigate({ search: (s) => ({ ...s, tab: value as Tab }) })}
			>
				<TabsList className="mb-6 max-w-full justify-start overflow-x-auto">
					<TabsTrigger value="schema">Schema</TabsTrigger>
					<TabsTrigger value="data">Data</TabsTrigger>
					<TabsTrigger value="snapshots">Snapshots</TabsTrigger>
					<TabsTrigger value="details">Details</TabsTrigger>
					<TabsTrigger value="access">Access</TabsTrigger>
				</TabsList>
				<TabsContent value="schema">
					<SchemaTab iceberg={iceberg} />
				</TabsContent>
				<TabsContent value="data">
					<DataTab detail={detail} />
				</TabsContent>
				<TabsContent value="snapshots">
					<SnapshotsTab iceberg={iceberg} />
				</TabsContent>
				<TabsContent value="details">
					<DetailsTab detail={detail} />
				</TabsContent>
				<TabsContent value="access">
					<AccessTab detail={detail} />
				</TabsContent>
			</Tabs>
		</Reveal>
	);
}

/** The table at a glance: its rows in the aurora, the history as a strand of snapshots, and the facts. */
function TableHero({ detail }: { detail: TableDetail }) {
	const iceberg = detail.iceberg;
	const metrics = iceberg?.metrics;
	const snapshots = iceberg?.snapshots ?? [];
	const latest = snapshots[0];
	return (
		<div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
			<AuroraCard className="flex min-h-72 flex-col p-7 sm:p-8">
				<span className="text-[13px] text-foreground/70">Records</span>
				<p className="mt-auto pt-12 font-[450] text-5xl leading-none tracking-[-0.04em] sm:text-6xl">
					<Metric value={metrics?.records ?? 0} />
				</p>
				<p className="mt-4 text-[15px] text-foreground/75">
					{latest
						? `Last ${latest.operation} ${formatRelative(latest.timestamp)}.`
						: "No engine has written to this table yet."}
				</p>
				{snapshots.length > 0 && <SnapshotStrand snapshots={snapshots} />}
			</AuroraCard>
			<Panel>
				<Facts
					items={[
						{ label: "Data files", value: formatCount(metrics?.dataFiles ?? 0) },
						{ label: "Size", value: formatBytes(metrics?.totalSize ?? 0) },
						{ label: "Snapshots", value: formatCount(snapshots.length) },
						{ label: "Columns", value: formatCount(iceberg?.fields.length ?? 0) },
						{
							label: "Partitioned by",
							value: iceberg?.partition.length
								? iceberg.partition.map((p) => p.sourceName).join(", ")
								: "Nothing",
							mono: Boolean(iceberg?.partition.length),
						},
					]}
				/>
			</Panel>
		</div>
	);
}

/** Every snapshot as a bead on one line, oldest on the left; the live one glows. */
function SnapshotStrand({ snapshots }: { snapshots: IcebergSnapshot[] }) {
	const ordered = [...snapshots].reverse();
	return (
		<div
			role="img"
			aria-label={`${snapshots.length} ${snapshots.length === 1 ? "snapshot" : "snapshots"}, oldest first`}
			className="relative mt-8 flex h-4 items-center justify-between"
		>
			<span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-foreground/25" />
			{ordered.map((snapshot) => (
				<span
					key={snapshot.id}
					title={`${snapshot.operation}, ${formatRelative(snapshot.timestamp)}`}
					className={cn(
						"relative rounded-full",
						snapshot.current
							? "size-3.5 bg-foreground shadow-[0_0_0_4px_color-mix(in_oklab,var(--foreground)_18%,transparent)]"
							: "size-2 bg-foreground/60",
					)}
				/>
			))}
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
		<div className="grid items-start gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
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
			<div className="space-y-4">
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

	return (
		<div className="grid items-start gap-4 xl:grid-cols-[20rem_1fr]">
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
				{preview.isPending ? (
					<SkeletonBlock className="h-40" />
				) : preview.data ? (
					<FileList
						files={preview.data.files}
						selected={preview.data.file}
						onSelect={(path) => select({ file: path })}
					/>
				) : null}
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
					preview.isFetching && !preview.isPending ? (
						<span className="tide h-1 w-16 rounded-full bg-area/30" />
					) : null
				}
			>
				{preview.error ? (
					<ErrorState error={preview.error} onRetry={() => preview.refetch()} />
				) : preview.isPending ? (
					<SkeletonBlock className="h-64" />
				) : (
					<>
						{preview.data.notes.map((note) => (
							<p key={note} className="mb-2 text-muted-foreground text-sm">
								{note}
							</p>
						))}
						{preview.data.rows.length > 0 && (
							<RowsGrid columns={preview.data.columns} rows={preview.data.rows} />
						)}
					</>
				)}
			</Panel>
		</div>
	);
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
								f.path === selected && "bg-area/10 ring-1 ring-area/40 ring-inset hover:bg-area/15",
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
		<div className="-mx-6 -mb-6 max-h-[32rem] overflow-auto">
			<table className="w-full text-sm">
				<thead className="sticky top-0 bg-card">
					<tr className="hairline-b">
						{columns.map((c) => (
							<th
								key={c}
								className="whitespace-nowrap px-6 py-2.5 text-left font-mono font-normal text-[13px] text-muted-foreground"
							>
								{c}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((row, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: preview rows have no identity; order is fixed.
						<tr key={index} className="hairline-b transition-colors last:border-0 hover:bg-raised">
							{row.map((value, column) => (
								<td
									// biome-ignore lint/suspicious/noArrayIndexKey: cells are positional.
									key={column}
									className={cn(
										"whitespace-nowrap px-6 py-2 font-mono text-xs",
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
		<div className="grid items-start gap-4 lg:grid-cols-2">
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
			<div className="space-y-4">
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
		<div className="grid items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
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
				<Button variant="ghost" className="text-destructive">
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
