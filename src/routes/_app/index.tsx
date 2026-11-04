import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { NAV_ITEMS } from "@/components/kelp/nav.ts";
import {
	CapacityBar,
	ErrorState,
	Metric,
	PageHeader,
	Reveal,
	Section,
	SkeletonBlock,
	StatusDot,
} from "@/components/kelp/page.tsx";
import { Tile } from "@/components/kelp/tile.tsx";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatCount, formatPercent, formatRelative, ratio } from "@/lib/format.ts";
import { queries } from "@/lib/queries.ts";

export const Route = createFileRoute("/_app/")({
	staticData: { title: "Overview" },
	loader: ({ context }) => void context.queryClient.prefetchQuery(queries.overview()),
	component: OverviewPage,
});

import { healthSummary } from "@/lib/health.ts";

export { healthSummary };

function OverviewPage() {
	const { data, error, refetch, isPending } = useQuery(queries.overview());
	if (isPending) return <OverviewSkeleton />;
	if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
	const health = healthSummary(data);
	const diskUsed = data.volumeServers.reduce((sum, s) => sum + s.diskUsage, 0);
	const diskTotal = data.volumeServers.reduce((sum, s) => sum + s.diskCapacity, 0);
	const slotsUsed = data.volumeServers.reduce((sum, s) => sum + s.volumes, 0);
	const slotsTotal = data.volumeServers.reduce((sum, s) => sum + s.maxVolumes, 0);
	const leader = data.masters.find((m) => m.isLeader);

	return (
		<>
			<PageHeader
				title="Overview"
				description={
					<span className="flex flex-wrap items-center gap-x-2">
						<StatusDot tone={health.tone} label={health.text} />
						<span className="text-tertiary">Updated {formatRelative(data.updatedAt)}</span>
					</span>
				}
			/>

			<Reveal className="grid grid-cols-2 gap-3 lg:grid-cols-12">
				<section className="group-sheet col-span-2 flex min-h-56 flex-col p-4 lg:col-span-6 lg:row-span-2">
					<WidgetLabel to="/cluster">Disk capacity</WidgetLabel>
					<p className="metric mt-1.5 font-semibold text-[28px] leading-8">
						<Metric value={diskUsed} format={formatBytes} />
						<span className="ml-1.5 font-normal font-sans text-[13px] text-muted-foreground tracking-normal">
							of {formatBytes(diskTotal)} used
						</span>
					</p>
					<div className="mt-3 flex items-center gap-3">
						<CapacityBar used={diskUsed} total={diskTotal} className="h-2" />
						<span className="shrink-0 text-[13px] text-muted-foreground tabular">
							{formatPercent(ratio(diskUsed, diskTotal))}
						</span>
					</div>
					<p className="mt-5 flex items-baseline justify-between text-[13px]">
						<span className="text-muted-foreground">Volume slots</span>
						<span className="tabular">
							{formatCount(slotsUsed)}{" "}
							<span className="text-muted-foreground">of {formatCount(slotsTotal)}</span>
						</span>
					</p>
					<CapacityBar used={slotsUsed} total={slotsTotal} className="mt-2" />
					<dl className="mt-auto grid grid-cols-3 gap-3 border-border border-t pt-3.5 text-[12px]">
						<Fact label="Object data" value={formatBytes(data.totalSize)} />
						<Fact label="Free" value={formatBytes(Math.max(0, diskTotal - diskUsed))} />
						<Fact label="Data centers" value={formatCount(data.dataCenters.length)} />
					</dl>
				</section>
				<Widget
					to="/volumes"
					label="Volumes"
					value={data.totalVolumes}
					hint={`Up to ${formatCount(data.volumeSizeLimitMb)} MiB each`}
				/>
				<Widget to="/volumes" label="Files" value={data.totalFiles} hint="Across all volumes" />
				<Widget
					to="/erasure-coding"
					label="EC shards"
					value={data.totalEcShards}
					hint={`${data.totalEcVolumes} encoded ${data.totalEcVolumes === 1 ? "volume" : "volumes"}`}
				/>
				<Widget to="/cluster" label="Mounts" value={data.totalMountClients} hint="FUSE clients connected" />
			</Reveal>

			<div className="mt-8 grid items-start gap-x-6 gap-y-8 lg:grid-cols-12">
				<Section
					title="Volume servers"
					className="mt-0 lg:col-span-7"
					actions={
						<Link to="/cluster" className="text-[13px] text-primary hover:underline">
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
					<div className="mt-2 px-4 text-[12px] text-muted-foreground">
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

/** A widget's label: the related page's identity tile and a name, linking to that page. */
function WidgetLabel({ to, children }: { to: string; children: string }) {
	const item = NAV_ITEMS.find((i) => i.to === to);
	return (
		<Link
			to={to as "/"}
			className="flex w-fit items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground"
		>
			{item && <Tile item={item} />}
			{children}
		</Link>
	);
}

/** One number the operator checks often, linking to where it comes from. */
function Widget({ to, label, value, hint }: { to: string; label: string; value: number; hint: string }) {
	return (
		<section className="group-sheet min-w-0 p-4 lg:col-span-3">
			<WidgetLabel to={to}>{label}</WidgetLabel>
			<p className="metric mt-1.5 font-semibold text-[28px] leading-8">
				<Metric value={value} />
			</p>
			<p className="mt-0.5 truncate text-[12px] text-muted-foreground">{hint}</p>
		</section>
	);
}

function Fact({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="truncate font-medium text-[13px] tabular">{value}</dd>
		</div>
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

function OverviewSkeleton() {
	return (
		<div role="status" aria-busy="true" aria-label="Loading overview">
			<div className="flex items-center gap-3 pt-2 pb-6">
				<SkeletonBlock className="size-9 rounded-[9px]" />
				<div className="space-y-1.5">
					<SkeletonBlock className="h-7 w-40" />
					<SkeletonBlock className="h-4 w-64" />
				</div>
			</div>
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-12">
				<SkeletonBlock className="col-span-2 h-56 rounded-xl lg:col-span-6 lg:row-span-2" />
				{[0, 1, 2, 3].map((i) => (
					<SkeletonBlock key={i} className="h-[106px] rounded-xl lg:col-span-3" />
				))}
			</div>
			<SkeletonBlock className="mt-8 h-64 rounded-xl" />
		</div>
	);
}
