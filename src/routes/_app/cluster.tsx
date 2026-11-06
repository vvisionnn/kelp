import type {
	ClusterNode,
	MasterNode,
	MountClient,
	Overview,
	TopologyDataCenter,
	VolumeServer,
} from "@shared/api.ts";
import type { Telemetry, TelemetryPoint, TrafficSample } from "@shared/telemetry.ts";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Cable, Crown, Network, Server } from "lucide-react";
import { z } from "zod";
import {
	dataColor,
	latest,
	millis,
	perSecond,
	Sparkline,
	TimeChart,
	type TimeSeries,
	useRange,
} from "@/components/kelp/charts/index.ts";
import { type Column, DataTable, type DataTableProps } from "@/components/kelp/data-table.tsx";
import {
	AuroraCard,
	CapacityBar,
	EmptyState,
	PageHeader,
	Panel,
	SkeletonBlock,
	StatBand,
	StatusDot,
} from "@/components/kelp/page.tsx";
import { LoadingRegion, RowsGhost } from "@/components/kelp/skeletons.tsx";
import { Frozen, ghostCells, PlotGhost, SearchGhost, StatsGhost } from "@/components/kelp/storage/common.tsx";
import {
	MetricsOffNote,
	RangeControl,
	useTelemetry,
	withTelemetry,
} from "@/components/kelp/storage/live.tsx";
import { RollingValue, TextMorph } from "@/components/kelp/text-morph.tsx";
import { Loaded, Swap } from "@/components/kelp/transitions.tsx";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBytes, formatCount, formatRelative } from "@/lib/format.ts";
import { queries } from "@/lib/queries.ts";

const TABS = ["masters", "volume-servers", "filers", "s3", "brokers", "mounts"] as const;
type Tab = (typeof TABS)[number];

export const Route = createFileRoute("/_app/cluster")({
	staticData: { section: "Cluster", title: "Nodes" },
	validateSearch: z.object({ tab: z.enum(TABS).optional() }),
	loader: ({ context }) => void context.queryClient.prefetchQuery(queries.topology()),
	component: ClusterPage,
});

/** Tabs drawn as a segmented control (DESIGN.md), scrolling sideways on narrow screens. */
const SEGMENTED_TABS = "mb-4 h-8 max-w-full justify-start overflow-x-auto rounded-lg bg-secondary p-0.5";
const SEGMENT =
	"h-7 flex-none rounded-md px-3 text-[13px] text-foreground/80 data-active:bg-[var(--thumb)] data-active:text-foreground data-active:shadow-[0_1px_3px_rgb(0_0_0/0.12)]";

function ClusterPage() {
	const { tab = "masters" } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const [range, setRange] = useRange();
	const overview = useQuery(queries.overview());
	const telemetry = useTelemetry(range);
	return (
		<>
			<PageHeader
				title="Nodes"
				description="Every process that makes up your SeaweedFS cluster."
				actions={<RangeControl telemetry={telemetry} range={range} onChange={setRange} />}
			/>
			<Loaded query={withTelemetry(overview, telemetry)} skeleton={<NodesSkeleton />}>
				{(data) => (
					<>
						<NodeCounts data={data} />
						<NodeActivity overview={data} telemetry={telemetry.data} />
					</>
				)}
			</Loaded>
			<TopologyMap />
			<Tabs
				value={tab}
				// Switching tabs keeps the reader where they are; the router would otherwise scroll to the top.
				onValueChange={(value) => navigate({ search: { tab: value as Tab }, resetScroll: false })}
				className="mt-8"
			>
				<TabsList className={SEGMENTED_TABS}>
					<TabsTrigger className={SEGMENT} value="masters">
						Masters
					</TabsTrigger>
					<TabsTrigger className={SEGMENT} value="volume-servers">
						Volume servers
					</TabsTrigger>
					<TabsTrigger className={SEGMENT} value="filers">
						Filers
					</TabsTrigger>
					<TabsTrigger className={SEGMENT} value="s3">
						S3 gateways
					</TabsTrigger>
					<TabsTrigger className={SEGMENT} value="brokers">
						Message brokers
					</TabsTrigger>
					<TabsTrigger className={SEGMENT} value="mounts">
						Mounts
					</TabsTrigger>
				</TabsList>
				{/* One panel whose content crossfades, so the old tab can fade out as the new one arrives. */}
				<TabsContent value={tab}>
					<Swap id={tab}>
						<TabView tab={tab} />
					</Swap>
				</TabsContent>
			</Tabs>
		</>
	);
}

function TabView({ tab }: { tab: Tab }) {
	switch (tab) {
		case "volume-servers":
			return <VolumeServersTab />;
		case "filers":
			return <NodesTab type="filers" noun="filers" description="Filers keep the file and bucket metadata." />;
		case "s3":
			return <NodesTab type="s3" noun="S3 gateways" description="S3 gateways serve the S3 API." />;
		case "brokers":
			return (
				<NodesTab
					type="brokers"
					noun="message brokers"
					description="Start `weed mq.broker` to enable the message queue."
				/>
			);
		case "mounts":
			return <MountsTab />;
		default:
			return <MastersTab />;
	}
}

/** How many of each process the cluster runs, as a row of widgets. */
function NodeCounts({ data }: { data: Overview }) {
	return (
		<StatBand
			className="sm:grid-cols-3 lg:grid-cols-6"
			stats={[
				{ label: "Masters", value: data.masters.length },
				{ label: "Volume servers", value: data.volumeServers.length },
				{ label: "Filers", value: data.filers.length },
				{ label: "S3 gateways", value: data.s3Gateways.length },
				{ label: "Message brokers", value: data.brokers.length },
				{ label: "Mounts", value: data.totalMountClients },
			]}
		/>
	);
}

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

/**
 * The cluster's shape: data centers side by side, racks inside them, and every volume server as a
 * row with its live fill level.
 */
export function TopologyMap() {
	const { data, error } = useQuery(queries.topology());
	return (
		<Loaded className="mt-3" query={{ data, error }} skeleton={<TopologySkeleton />}>
			{(dataCenters) => <Topology dataCenters={dataCenters} />}
		</Loaded>
	);
}

function Topology({ dataCenters }: { dataCenters: TopologyDataCenter[] }) {
	const racks = dataCenters.reduce((sum, dc) => sum + dc.racks.length, 0);
	return (
		<AuroraCard className="p-4">
			<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<h2 className="font-semibold text-[13px]">Topology</h2>
				<p className="text-[12px] text-muted-foreground">
					<TextMorph>
						{`${dataCenters.length} ${dataCenters.length === 1 ? "data center" : "data centers"}, ${racks} ${racks === 1 ? "rack" : "racks"}`}
					</TextMorph>
				</p>
			</div>
			<div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{dataCenters.map((dc) => (
					<section key={dc.id} className="min-w-0">
						<h3 className="font-medium text-[13px]">{dc.id}</h3>
						<div className="mt-2 space-y-3">
							{dc.racks.map((rack) => (
								<div key={rack.id}>
									<p className="mb-1 text-[12px] text-muted-foreground">{rack.id}</p>
									<ul className="space-y-1">
										{rack.nodes.map((node) => (
											<li key={node.id} className="rounded-lg bg-raised px-3 py-2">
												<div className="flex items-center justify-between gap-2 text-[13px]">
													<span className="flex min-w-0 items-center gap-1.5">
														<Server className="size-3.5 shrink-0 text-muted-foreground" />
														<span className="truncate font-mono">{node.address}</span>
													</span>
													<span className="shrink-0 text-[12px] text-muted-foreground tabular">
														<TextMorph>{`${formatCount(node.volumes)} volumes`}</TextMorph>
													</span>
												</div>
												<div className="mt-2 flex items-center gap-3">
													<CapacityBar used={node.diskUsage} total={node.diskCapacity} />
													<span className="shrink-0 text-[12px] text-muted-foreground tabular">
														<TextMorph>
															{`${formatBytes(node.diskUsage)} of ${formatBytes(node.diskCapacity)}`}
														</TextMorph>
													</span>
												</div>
											</li>
										))}
									</ul>
								</div>
							))}
						</div>
					</section>
				))}
			</div>
		</AuroraCard>
	);
}

/** One rack with one node: the smallest real shape, so a cluster only ever grows from the ghost. */
function TopologySkeleton() {
	return (
		<LoadingRegion label="Loading topology">
			<AuroraCard className="p-4">
				<div className="flex items-baseline justify-between gap-4">
					<h2 className="font-semibold text-[13px]">Topology</h2>
					<SkeletonBlock className="h-3 w-32" />
				</div>
				<div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					<div>
						<div className="flex h-5 items-center">
							<SkeletonBlock className="h-3.5 w-36" />
						</div>
						<div className="mt-2 mb-1 flex h-5 items-center">
							<SkeletonBlock className="h-3 w-24" />
						</div>
						<div className="space-y-2 rounded-lg bg-raised px-3 py-2">
							<div className="flex h-5 items-center">
								<SkeletonBlock className="h-3.5 w-full" />
							</div>
							<div className="flex h-5 items-center">
								<SkeletonBlock className="h-1.5 w-full" />
							</div>
						</div>
					</div>
				</div>
			</AuroraCard>
		</LoadingRegion>
	);
}

function NodesSkeleton() {
	return (
		<LoadingRegion label="Loading nodes">
			<StatsGhost count={6} hint={false} className="sm:grid-cols-3 lg:grid-cols-6" />
			<div className="mt-3 grid gap-3 xl:grid-cols-12">
				<Panel title="Requests" description="Per second, by component" className="min-w-0 xl:col-span-8">
					<PlotGhost height={200} />
				</Panel>
				<Panel
					title="Processes"
					description="Summed over every SeaweedFS process"
					className="min-w-0 xl:col-span-4"
				>
					<div className="space-y-4">
						{[0, 1, 2].map((i) => (
							<div key={i} className="flex h-[52px] items-center justify-between gap-3">
								<div className="space-y-2">
									<SkeletonBlock className="h-3.5 w-16" />
									<SkeletonBlock className="h-5 w-24" />
								</div>
								<SkeletonBlock className="h-8 w-[120px]" />
							</div>
						))}
					</div>
				</Panel>
			</div>
			<div className="mt-3 grid gap-3 xl:grid-cols-12">
				<Panel title="Latency" description="95th percentile, by component" className="min-w-0 xl:col-span-7">
					<PlotGhost height={180} />
				</Panel>
				<Panel
					title="Volume slots"
					description="Volumes each server holds, of its maximum"
					className="min-w-0 xl:col-span-5"
				>
					<div className="flex h-8 flex-col justify-between">
						<RowsGhost rows={1} />
						<SkeletonBlock className="h-1.5 w-full" />
					</div>
				</Panel>
			</div>
		</LoadingRegion>
	);
}

/** A tab's table: its own loading rows and error, with the data staying put through failed refreshes. */
function TabTable<T extends object>({
	query,
	label,
	searchText,
	ghostHeight,
	...table
}: { query: UseQueryResult<T[]>; label: string; ghostHeight?: number } & Omit<DataTableProps<T>, "data">) {
	const { data, error, refetch } = query;
	return (
		<Loaded
			query={{ data, error, refetch }}
			skeleton={
				<LoadingRegion label={label}>
					<Frozen>
						<DataTable
							{...table}
							columns={ghostCells(table.columns, ghostHeight)}
							data={undefined}
							isLoading
							{...(searchText ? { toolbar: <SearchGhost /> } : {})}
						/>
					</Frozen>
				</LoadingRegion>
			}
		>
			{(rows) => <DataTable {...table} {...(searchText ? { searchText } : {})} data={rows} />}
		</Loaded>
	);
}

const masterColumns: Array<Column<MasterNode>> = [
	{
		accessorKey: "address",
		header: "Address",
		cell: ({ row }) => <span className="font-mono">{row.original.address}</span>,
	},
	{
		id: "role",
		header: "Role",
		cell: ({ row }) =>
			row.original.isLeader ? (
				<StatusDot tone="good" label="Leader" />
			) : (
				<StatusDot tone="idle" label="Follower" />
			),
	},
	{ accessorKey: "suffrage", header: "Raft", cell: ({ row }) => row.original.suffrage ?? "—" },
];

function MastersTable({ masters, isLoading }: { masters: MasterNode[] | undefined; isLoading?: boolean }) {
	return (
		<DataTable
			data={masters}
			isLoading={isLoading}
			getRowId={(m) => m.address}
			empty={
				<EmptyState
					icon={<Crown />}
					title="No masters reported"
					description="Kelp could not find any master servers."
				/>
			}
			columns={isLoading ? ghostCells(masterColumns) : masterColumns}
		/>
	);
}

function MastersTab() {
	const { data, error, refetch } = useQuery(queries.masters());
	return (
		<Loaded
			query={{ data, error, refetch }}
			skeleton={
				<LoadingRegion label="Loading masters" className="space-y-3">
					<div className="flex h-[19.5px] items-center">
						<SkeletonBlock className="h-3.5 w-80 max-w-full" />
					</div>
					<Frozen>
						<MastersTable masters={undefined} isLoading />
					</Frozen>
				</LoadingRegion>
			}
		>
			{({ masters, leader, maxVolumeId }) => (
				<div className="space-y-3">
					<p className="text-[13px] text-muted-foreground">
						Leader <span className="font-mono text-foreground">{leader}</span>.{" "}
						<TextMorph>{`Highest volume id ${formatCount(maxVolumeId)}.`}</TextMorph>
					</p>
					<MastersTable masters={masters} />
				</div>
			)}
		</Loaded>
	);
}

export const volumeServerColumns: Array<Column<VolumeServer>> = [
	{
		accessorKey: "address",
		header: "Address",
		cell: ({ row }) => (
			<div>
				<p className="font-mono">{row.original.address}</p>
				<p className="text-[12px] text-muted-foreground">
					{row.original.dataCenter} / {row.original.rack}
				</p>
			</div>
		),
		size: 220,
	},
	{
		accessorKey: "volumes",
		header: "Volumes",
		cell: ({ row }) => (
			<span className="tabular">
				{formatCount(row.original.volumes)} / {formatCount(row.original.maxVolumes)}
			</span>
		),
	},
	{
		accessorKey: "ecShards",
		header: "EC shards",
		cell: ({ row }) => <span className="tabular">{formatCount(row.original.ecShards)}</span>,
	},
	{
		id: "disk",
		accessorFn: (row) => row.diskUsage / (row.diskCapacity || 1),
		header: "Disk",
		cell: ({ row }) => (
			<div className="w-40">
				<CapacityBar used={row.original.diskUsage} total={row.original.diskCapacity} />
				<p className="mt-1 text-[12px] text-muted-foreground tabular">
					{formatBytes(row.original.diskUsage)} / {formatBytes(row.original.diskCapacity)}
				</p>
			</div>
		),
		size: 200,
	},
	{
		accessorKey: "version",
		header: "Version",
		cell: ({ row }) => (
			<span className="font-mono text-[12px]">{row.original.version.split(" ")[0] || "—"}</span>
		),
	},
	{
		accessorKey: "lastHeartbeat",
		header: "Heartbeat",
		cell: ({ row }) => (
			<span className="text-[12px] text-muted-foreground">{formatRelative(row.original.lastHeartbeat)}</span>
		),
	},
];

function VolumeServersTab() {
	return (
		<TabTable
			query={useQuery(queries.volumeServers())}
			label="Loading volume servers"
			ghostHeight={38}
			getRowId={(s) => s.id}
			searchText={(s) => `${s.address} ${s.dataCenter} ${s.rack}`}
			searchPlaceholder="Search volume servers"
			empty={
				<EmptyState
					icon={<Server />}
					title="No volume servers"
					description="Start a volume server to store data."
				/>
			}
			columns={volumeServerColumns}
		/>
	);
}

const nodeColumns: Array<Column<ClusterNode>> = [
	{
		accessorKey: "address",
		header: "Address",
		cell: ({ row }) => <span className="font-mono">{row.original.address}</span>,
	},
	{ accessorKey: "version", header: "Version", cell: ({ row }) => row.original.version.split(" ")[0] || "—" },
	{
		id: "placement",
		header: "Placement",
		cell: ({ row }) =>
			row.original.dataCenter || row.original.rack ? (
				`${row.original.dataCenter || "any"} / ${row.original.rack || "any"}`
			) : (
				<span className="text-muted-foreground">Unassigned</span>
			),
	},
	{
		accessorKey: "createdAt",
		header: "Joined",
		cell: ({ row }) => (
			<span className="text-[12px] text-muted-foreground">{formatRelative(row.original.createdAt)}</span>
		),
	},
];

function NodesTab({
	type,
	noun,
	description,
}: {
	type: "filers" | "s3" | "brokers";
	noun: string;
	description: string;
}) {
	return (
		<TabTable
			query={useQuery(queries.nodes(type))}
			label={`Loading ${noun}`}
			getRowId={(n) => n.address}
			empty={<EmptyState icon={<Network />} title={`No ${noun} running`} description={description} />}
			columns={nodeColumns}
		/>
	);
}

const mountColumns: Array<Column<MountClient>> = [
	{
		accessorKey: "address",
		header: "Client",
		cell: ({ row }) => <span className="font-mono">{row.original.address || row.original.clientName}</span>,
	},
	{
		accessorKey: "path",
		header: "Mounted path",
		cell: ({ row }) => <span className="font-mono">{row.original.path}</span>,
	},
	{
		accessorKey: "clientType",
		header: "Type",
		cell: ({ row }) => <Badge variant="secondary">{row.original.clientType}</Badge>,
	},
	{
		accessorKey: "filer",
		header: "Filer",
		cell: ({ row }) => <span className="font-mono text-[12px]">{row.original.filer}</span>,
	},
	{
		accessorKey: "connectedAt",
		header: "Connected",
		cell: ({ row }) => (
			<span className="text-[12px] text-muted-foreground">{formatRelative(row.original.connectedAt)}</span>
		),
	},
];

function MountsTab() {
	return (
		<TabTable
			query={useQuery(queries.mountClients())}
			label="Loading mounts"
			getRowId={(m) => `${m.filer}-${m.clientId}-${m.address}`}
			searchText={(m) => `${m.address} ${m.path} ${m.filer}`}
			searchPlaceholder="Search mounts"
			empty={
				<EmptyState
					icon={<Cable />}
					title="No mounts connected"
					description="Clients appear here while `weed mount` is running against a filer."
				/>
			}
			columns={mountColumns}
		/>
	);
}

/** CPU summed over processes, as cores in use: 166% reads as "1.66 cores", never a percentage past 100. */
export function cores(percent: number): string {
	const value = percent / 100;
	return `${value < 10 ? value.toFixed(2) : value.toFixed(1)} ${value === 1 ? "core" : "cores"}`;
}
