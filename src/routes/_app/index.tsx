import type { Overview } from "@shared/api.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import type { Area } from "@/components/kelp/nav.ts";
import {
	AuroraCard,
	CapacityBar,
	ErrorState,
	Panel,
	Reveal,
	SkeletonBlock,
	StatBand,
	StatusDot,
} from "@/components/kelp/page.tsx";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatCount, formatPercent, formatRelative, ratio } from "@/lib/format.ts";
import { queries } from "@/lib/queries.ts";
import { cn } from "@/lib/utils";

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

/** The overview's headline: one short statement, so the page opens with the answer. */
function headline(tone: "good" | "warn" | "bad"): string {
	return { good: "Everything is calm.", warn: "Worth a look.", bad: "Needs attention now." }[tone];
}

function OverviewPage() {
	const { data, error, refetch, isPending } = useQuery(queries.overview());
	if (isPending) return <OverviewSkeleton />;
	if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
	const health = healthSummary(data);
	const diskUsed = data.volumeServers.reduce((sum, s) => sum + s.diskUsage, 0);
	const diskTotal = data.volumeServers.reduce((sum, s) => sum + s.diskCapacity, 0);
	const leader = data.masters.find((m) => m.isLeader);

	return (
		<>
			<section className="grid items-end gap-x-12 gap-y-10 pt-10 pb-14 sm:pt-16 lg:grid-cols-[1.15fr_1fr]">
				<Reveal>
					<span className="inline-flex h-8 items-center rounded-full bg-secondary px-3.5 text-[13px]">
						<StatusDot tone={health.tone} label={health.text} />
					</span>
					<h1 className="mt-6 text-balance font-[450] text-5xl leading-[1.02] tracking-[-0.035em] sm:text-6xl">
						{headline(health.tone)}
					</h1>
					<p className="mt-5 max-w-[52ch] text-[17px] text-muted-foreground leading-relaxed">
						SeaweedFS holds {formatBytes(data.totalSize)} of object data in {formatCount(data.totalVolumes)}{" "}
						volumes, coordinated by{" "}
						{leader ? <span className="font-mono text-foreground">{leader.address}</span> : "no leader"}.
					</p>
				</Reveal>
				<Reveal delay={0.08}>
					<AuroraCard className="p-7 sm:p-8">
						<div className="flex items-center justify-between text-[13px] text-foreground/70">
							<span>Disk capacity</span>
							<span>Across all volume servers</span>
						</div>
						<div className="mt-10 flex flex-wrap items-baseline gap-x-3 gap-y-1">
							<span className="font-[450] text-5xl leading-none tracking-[-0.04em]">
								{formatBytes(diskUsed)}
							</span>
							<span className="text-foreground/70">of {formatBytes(diskTotal)} used</span>
						</div>
						<CapacityBar used={diskUsed} total={diskTotal} className="mt-6 h-2 bg-foreground/10" />
					</AuroraCard>
				</Reveal>
			</section>

			<Reveal delay={0.12} className="hairline-t hairline-b py-10">
				<StatBand
					stats={[
						{
							label: "Volumes",
							value: data.totalVolumes,
							hint: `Limit ${formatCount(data.volumeSizeLimitMb)} MiB each`,
						},
						{ label: "Files", value: data.totalFiles },
						{
							label: "EC shards",
							value: data.totalEcShards,
							hint: `${data.totalEcVolumes} encoded ${data.totalEcVolumes === 1 ? "volume" : "volumes"}`,
						},
						{ label: "Mounts", value: data.totalMountClients, hint: "FUSE clients connected" },
					]}
				/>
			</Reveal>

			<section className="pt-16">
				<h2 className="font-[450] text-3xl tracking-[-0.025em]">Where to go</h2>
				<div className="mt-8 grid gap-4 md:grid-cols-6">
					<AreaCard
						area="storage"
						to="/volumes"
						title="Storage"
						value={formatCount(data.totalVolumes)}
						unit="volumes"
						text="Vacuum, grow and freeze volumes. Watch erasure-coded shards."
						className="md:col-span-4 md:row-span-2 md:min-h-80"
					/>
					<AreaCard
						area="cluster"
						to="/cluster"
						title="Cluster"
						value={formatCount(data.masters.length + data.volumeServers.length + data.filers.length)}
						unit="nodes"
						text="Masters, volume servers, filers and gateways."
						className="md:col-span-2"
					/>
					<AreaCard
						area="objects"
						to="/buckets"
						title="Object store"
						value={formatCount(data.s3Gateways.length)}
						unit={data.s3Gateways.length === 1 ? "S3 gateway" : "S3 gateways"}
						text="Buckets, files and Iceberg tables."
						className="md:col-span-2"
					/>
					<AreaCard
						area="access"
						to="/access/users"
						title="Access"
						text="Users, keys, groups and IAM policies."
						className="md:col-span-3"
					/>
					<AreaCard
						area="operations"
						to="/maintenance"
						title="Operations"
						value={formatCount(data.maintenance.workers)}
						unit={`${data.maintenance.workers === 1 ? "worker" : "workers"}, ${data.maintenance.tasks} tasks running`}
						text="Maintenance jobs, messaging and settings."
						className="md:col-span-3"
					/>
				</div>
			</section>

			<section className="mt-16 grid items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
				<Panel
					title="Volume servers"
					actions={
						<Link to="/cluster" className="text-[13px] text-muted-foreground hover:text-foreground">
							All nodes
						</Link>
					}
				>
					<ul className="divide-y divide-hairline">
						{data.volumeServers.map((server) => (
							<li key={server.id} className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[1fr_12rem]">
								<div className="min-w-0">
									<p className="truncate font-medium font-mono text-sm">{server.address}</p>
									<p className="text-muted-foreground text-xs">
										{server.dataCenter} / {server.rack}, {formatCount(server.volumes)} of{" "}
										{formatCount(server.maxVolumes)} volume slots
									</p>
								</div>
								<div className="self-center" data-area="storage">
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
					<div className="hairline-t mt-5 pt-4 text-sm">
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
			</section>

			{data.tiers.length > 0 && (
				<section className="mt-4" data-area="storage">
					<Panel title="Storage tiers">
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{data.tiers.map((tier) => (
								<div key={tier.name} className="rounded-md bg-raised p-5">
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
				</section>
			)}
		</>
	);
}

/** One area in the bento: its own aurora, a live number when there is one, and where it leads. */
function AreaCard({
	area,
	to,
	title,
	value,
	unit,
	text,
	className,
}: {
	area: Area;
	to: string;
	title: string;
	value?: string;
	unit?: string;
	text: string;
	className?: string;
}) {
	return (
		<Link to={to as "/"} data-area={area} className={cn("group rounded-2xl", className)}>
			<AuroraCard className="flex h-full min-h-56 flex-col p-7">
				<div className="flex items-center justify-between">
					<span className="font-medium text-[15px]">{title}</span>
					<ArrowUpRight className="size-4 text-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
				</div>
				<div className="mt-auto pt-10">
					{value !== undefined && (
						<p className="flex items-baseline gap-2">
							<span className="font-[450] text-5xl leading-none tracking-[-0.04em] tabular">{value}</span>
							<span className="text-[13px] text-foreground/70">{unit}</span>
						</p>
					)}
					<p className="mt-3 max-w-[40ch] text-[13px] text-foreground/70">{text}</p>
				</div>
			</AuroraCard>
		</Link>
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
			<div className="grid items-end gap-12 pt-16 pb-14 lg:grid-cols-[1.15fr_1fr]">
				<div>
					<SkeletonBlock className="h-8 w-64 rounded-full" />
					<SkeletonBlock className="mt-6 h-14 w-full max-w-md" />
					<SkeletonBlock className="mt-5 h-5 w-80" />
				</div>
				<SkeletonBlock className="h-52 rounded-2xl" />
			</div>
			<div className="grid grid-cols-2 gap-8 py-10 sm:grid-cols-4">
				{[0, 1, 2, 3].map((i) => (
					<SkeletonBlock key={i} className="h-16" />
				))}
			</div>
		</div>
	);
}
