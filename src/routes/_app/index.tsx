import type { Overview } from "@shared/api.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Blocks, Cable, FileStack, HardDrive } from "lucide-react";
import {
	CapacityBar,
	ErrorState,
	PageHeader,
	Panel,
	Reveal,
	SkeletonBlock,
	StatTile,
	StatusDot,
} from "@/components/kelp/page.tsx";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatCount, formatPercent, formatRelative, ratio } from "@/lib/format.ts";
import { queries } from "@/lib/queries.ts";

export const Route = createFileRoute("/_app/")({
	staticData: { title: "Overview" },
	loader: ({ context }) => void context.queryClient.prefetchQuery(queries.overview()),
	component: OverviewPage,
});

/** One sentence describing cluster health, for the page header. */
export function healthSummary(overview: Overview): { tone: "good" | "warn" | "bad"; text: string } {
	const leader = overview.masters.some((m) => m.isLeader);
	if (!leader) return { tone: "bad", text: "No master leader. The cluster cannot assign new writes." };
	if (overview.volumeServers.length === 0) return { tone: "bad", text: "No volume servers are reporting." };
	const used = ratio(
		overview.volumeServers.reduce((sum, s) => sum + s.diskUsage, 0),
		overview.volumeServers.reduce((sum, s) => sum + s.diskCapacity, 0),
	);
	if (used >= 0.9) return { tone: "warn", text: `Disks are ${formatPercent(used)} full. Add capacity soon.` };
	if (!overview.versions.uniform) return { tone: "warn", text: "Nodes run different SeaweedFS versions." };
	const servers = overview.volumeServers.length;
	return {
		tone: "good",
		text: `Healthy. ${servers} volume ${servers === 1 ? "server" : "servers"} reporting.`,
	};
}

function OverviewPage() {
	const { data, error, refetch, isPending } = useQuery(queries.overview());
	if (isPending) return <OverviewSkeleton />;
	if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
	const health = healthSummary(data);
	const diskUsed = data.volumeServers.reduce((sum, s) => sum + s.diskUsage, 0);
	const diskTotal = data.volumeServers.reduce((sum, s) => sum + s.diskCapacity, 0);

	return (
		<>
			<PageHeader title="Overview" description={<StatusDot tone={health.tone} label={health.text} />} />
			<Reveal className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
				<Panel title="Disk capacity" description="Across all volume servers">
					<div className="flex items-baseline gap-2">
						<span className="font-semibold text-4xl tracking-tight [font-stretch:85%]">
							{formatBytes(diskUsed)}
						</span>
						<span className="text-muted-foreground">of {formatBytes(diskTotal)} used</span>
					</div>
					<CapacityBar used={diskUsed} total={diskTotal} className="mt-4 h-2" />
					<p className="mt-3 text-muted-foreground text-sm">
						SeaweedFS holds {formatBytes(data.totalSize)} of object data in {formatCount(data.totalVolumes)}{" "}
						volumes.
					</p>
				</Panel>
				<div className="grid grid-cols-2 gap-4">
					<StatTile
						label="Volumes"
						value={data.totalVolumes}
						icon={<HardDrive />}
						hint={`Limit ${formatCount(data.volumeSizeLimitMb)} MiB each`}
					/>
					<StatTile label="Files" value={data.totalFiles} icon={<FileStack />} />
					<StatTile
						label="EC shards"
						value={data.totalEcShards}
						icon={<Blocks />}
						hint={`${data.totalEcVolumes} encoded ${data.totalEcVolumes === 1 ? "volume" : "volumes"}`}
					/>
					<StatTile
						label="Mounts"
						value={data.totalMountClients}
						icon={<Cable />}
						hint="FUSE clients connected"
					/>
				</div>
			</Reveal>

			<Reveal delay={0.06} className="mt-4 grid items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
				<Panel
					title="Volume servers"
					actions={
						<Link to="/cluster" className="text-primary text-xs hover:underline">
							All nodes
						</Link>
					}
				>
					<ul className="divide-y">
						{data.volumeServers.map((server) => (
							<li key={server.id} className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[1fr_12rem]">
								<div className="min-w-0">
									<p className="truncate font-medium font-mono text-sm">{server.address}</p>
									<p className="text-muted-foreground text-xs">
										{server.dataCenter} / {server.rack} · {formatCount(server.volumes)} of{" "}
										{formatCount(server.maxVolumes)} volume slots
									</p>
								</div>
								<div className="self-center">
									<CapacityBar used={server.diskUsage} total={server.diskCapacity} />
									<p className="mt-1 text-right text-muted-foreground text-xs tabular">
										{formatBytes(server.diskUsage)} / {formatBytes(server.diskCapacity)}
									</p>
								</div>
							</li>
						))}
					</ul>
				</Panel>
				<Panel title="Services">
					<dl className="grid gap-3 text-sm">
						<ServiceRow
							label="Masters"
							count={data.masters.length}
							detail={data.masters.find((m) => m.isLeader)?.address ?? "no leader"}
						/>
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
					<div className="mt-4 border-t pt-4 text-sm">
						{data.versions.uniform ? (
							<p className="text-muted-foreground">
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
								<ul className="mt-2 space-y-1 text-xs">
									{data.versions.groups.map((group) => (
										<li key={group.type}>
											{group.type}:{" "}
											{group.versions.map((v) => `${v.version.split(" ")[0]} (${v.count})`).join(", ")}
										</li>
									))}
								</ul>
							</div>
						)}
						<p className="mt-1 text-muted-foreground text-xs">Updated {formatRelative(data.updatedAt)}</p>
					</div>
				</Panel>
			</Reveal>

			{data.tiers.length > 0 && (
				<Reveal delay={0.12} className="mt-4">
					<Panel title="Storage tiers">
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{data.tiers.map((tier) => (
								<div key={tier.name} className="rounded-lg bg-muted/50 p-4">
									<div className="flex items-center justify-between">
										<span className="font-medium">{tier.name}</span>
										<Badge variant="secondary">{tier.isRemote ? "Remote" : "Local disk"}</Badge>
									</div>
									<p className="mt-2 text-muted-foreground text-sm">
										{formatCount(tier.volumeCount)} volumes, {formatCount(tier.ecShardCount)} EC shards,{" "}
										{formatBytes(tier.dataSize)} of data
									</p>
									{!tier.isRemote && (
										<CapacityBar used={tier.diskUsed} total={tier.diskCapacity} className="mt-3" />
									)}
								</div>
							))}
						</div>
					</Panel>
				</Reveal>
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
		<div className="flex items-center justify-between gap-3">
			<dt className="flex items-center gap-2">
				<StatusDot tone={count > 0 ? "good" : "idle"} label={label} />
			</dt>
			<dd className="flex min-w-0 items-center gap-2 text-muted-foreground">
				{detail && <span className="truncate font-mono text-xs">{detail}</span>}
				{note && <span className="truncate text-xs">{note}</span>}
				<span className="tabular font-medium text-foreground">{count}</span>
			</dd>
		</div>
	);
}

function OverviewSkeleton() {
	return (
		<div role="status" aria-busy="true" aria-label="Loading overview">
			<SkeletonBlock className="mt-2 mb-6 h-8 w-48" />
			<div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
				<SkeletonBlock className="h-44 rounded-xl" />
				<div className="grid grid-cols-2 gap-4">
					{[0, 1, 2, 3].map((i) => (
						<SkeletonBlock key={i} className="h-20 rounded-xl" />
					))}
				</div>
			</div>
			<SkeletonBlock className="mt-4 h-64 rounded-xl" />
		</div>
	);
}
