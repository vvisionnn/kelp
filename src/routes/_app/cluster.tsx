import type { ClusterNode, MountClient, TopologyDataCenter, VolumeServer } from "@shared/api.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Cable, Crown, Network, Server } from "lucide-react";
import { z } from "zod";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import {
	AuroraCard,
	CapacityBar,
	EmptyState,
	PageHeader,
	Reveal,
	SkeletonBlock,
	StatBand,
	StatusDot,
} from "@/components/kelp/page.tsx";
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
	return (
		<>
			<PageHeader title="Nodes" description="Every process that makes up your SeaweedFS cluster." />
			<Reveal>
				<NodeCounts />
				<TopologyMap />
			</Reveal>
			<Tabs
				value={tab}
				onValueChange={(value) => navigate({ search: { tab: value as Tab } })}
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
				<TabsContent value="masters">
					<MastersTab />
				</TabsContent>
				<TabsContent value="volume-servers">
					<VolumeServersTab />
				</TabsContent>
				<TabsContent value="filers">
					<NodesTab type="filers" noun="filers" description="Filers keep the file and bucket metadata." />
				</TabsContent>
				<TabsContent value="s3">
					<NodesTab type="s3" noun="S3 gateways" description="S3 gateways serve the S3 API." />
				</TabsContent>
				<TabsContent value="brokers">
					<NodesTab
						type="brokers"
						noun="message brokers"
						description="Start `weed mq.broker` to enable the message queue."
					/>
				</TabsContent>
				<TabsContent value="mounts">
					<MountsTab />
				</TabsContent>
			</Tabs>
		</>
	);
}

/** How many of each process the cluster runs, as a row of widgets. */
function NodeCounts() {
	const { data } = useQuery(queries.overview());
	if (!data) return <SkeletonBlock className="h-[88px] rounded-xl" />;
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

/**
 * The cluster's shape: data centers side by side, racks inside them, and every volume server as a
 * row with its live fill level.
 */
export function TopologyMap() {
	const { data, isPending, error } = useQuery(queries.topology());
	if (isPending) return <SkeletonBlock className="mt-3 h-44 rounded-xl" />;
	if (error) return null;
	const racks = data.reduce((sum, dc) => sum + dc.racks.length, 0);
	return (
		<AuroraCard className="mt-3 p-4">
			<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<h2 className="font-semibold text-[13px]">Topology</h2>
				<p className="text-[12px] text-muted-foreground">
					{data.length} {data.length === 1 ? "data center" : "data centers"}, {racks}{" "}
					{racks === 1 ? "rack" : "racks"}
				</p>
			</div>
			<div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{data.map((dc: TopologyDataCenter) => (
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
														{formatCount(node.volumes)} volumes
													</span>
												</div>
												<div className="mt-2 flex items-center gap-3">
													<CapacityBar used={node.diskUsage} total={node.diskCapacity} />
													<span className="shrink-0 text-[12px] text-muted-foreground tabular">
														{formatBytes(node.diskUsage)} of {formatBytes(node.diskCapacity)}
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

function MastersTab() {
	const { data, isPending, error, refetch } = useQuery(queries.masters());
	return (
		<div className="space-y-3">
			{data && (
				<p className="text-[13px] text-muted-foreground">
					Leader <span className="font-mono text-foreground">{data.leader}</span>. Highest volume id{" "}
					{formatCount(data.maxVolumeId)}.
				</p>
			)}
			<DataTable
				data={data?.masters}
				isLoading={isPending}
				error={error}
				onRetry={() => refetch()}
				getRowId={(m) => m.address}
				empty={
					<EmptyState
						icon={<Crown />}
						title="No masters reported"
						description="Kelp could not find any master servers."
					/>
				}
				columns={[
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
				]}
			/>
		</div>
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
	const { data, isPending, error, refetch } = useQuery(queries.volumeServers());
	return (
		<DataTable
			data={data}
			isLoading={isPending}
			error={error}
			onRetry={() => refetch()}
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
	const { data, isPending, error, refetch } = useQuery(queries.nodes(type));
	return (
		<DataTable
			data={data}
			isLoading={isPending}
			error={error}
			onRetry={() => refetch()}
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
	const { data, isPending, error, refetch } = useQuery(queries.mountClients());
	return (
		<DataTable
			data={data}
			isLoading={isPending}
			error={error}
			onRetry={() => refetch()}
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
