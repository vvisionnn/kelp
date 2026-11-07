import type { EcPlacement, EcVolume, StorageInventory } from "@shared/storage.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Blocks } from "lucide-react";
import { useMemo } from "react";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import {
	EmptyState,
	FeatureSheet,
	PageHeader,
	Section,
	SkeletonBlock,
	StatBand,
	StatusDot,
} from "@/components/kelp/page.tsx";
import { LoadingRegion } from "@/components/kelp/skeletons.tsx";
import {
	Collapse,
	DescriptionGhost,
	Frozen,
	ghostCells,
	StatsGhost,
} from "@/components/kelp/storage/common.tsx";
import { ecHealth, shardCounts } from "@/components/kelp/storage/ec-volume-list.tsx";
import { ServerLegend, ShardMap, serverFill, shardRanges } from "@/components/kelp/storage/shard-map.tsx";
import { Loaded, Swap } from "@/components/kelp/transitions.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { Button } from "@/components/ui/button";
import { formatBytes, formatCount, formatDateTime, plural } from "@/lib/format.ts";
import { collectionLabel, collectionParam, serverPalette, storageQueries } from "@/lib/storage-queries.ts";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/erasure-coding/$volumeId")({
	staticData: { section: "Storage", title: "Erasure coding", crumb: ({ volumeId }) => `Volume ${volumeId}` },
	loader: ({ context }) => void context.queryClient.prefetchQuery(storageQueries.inventory()),
	component: EcVolumePage,
});

function placementColumns(palette: Map<string, number>): Array<Column<EcPlacement>> {
	return [
		{
			accessorKey: "server",
			header: "Server",
			cell: ({ row }) => (
				<div className="flex items-center gap-2.5">
					<span className={cn("size-2.5 shrink-0 rounded-[3px]", serverFill(palette, row.original.server))} />
					<div>
						<p className="font-mono">{row.original.server}</p>
						<p className="text-muted-foreground text-xs">
							{row.original.dataCenter} / {row.original.rack}, {row.original.diskType} #{row.original.diskId}
						</p>
					</div>
				</div>
			),
		},
		{
			id: "shards",
			accessorFn: (p) => p.shards.length,
			header: "Shards",
			cell: ({ row }) => (
				<span className="tabular">
					{row.original.shards.length}
					<span className="ml-2 font-mono text-muted-foreground text-xs">
						{shardRanges(row.original.shards.map((s) => s.id))}
					</span>
				</span>
			),
		},
		{
			accessorKey: "size",
			header: "Size",
			cell: ({ row }) => <span className="tabular">{formatBytes(row.original.size)}</span>,
		},
	];
}

function EcVolumePage() {
	const { volumeId } = Route.useParams();
	const inventory = useQuery(storageQueries.inventory());
	const { data, error } = inventory;
	const ec = data?.ecVolumes.find((v) => v.id === Number(volumeId));
	const loading = !data && !error;
	const health = ec && ecHealth(ec);

	return (
		<>
			<PageHeader
				title={`Volume ${volumeId}`}
				description={
					<Swap id={ec ? "volume" : loading ? "pending" : "none"}>
						{ec && health ? (
							<span className="flex flex-wrap items-center gap-x-3 gap-y-1">
								<StatusDot tone={health.tone} label={health.label} />
								<span>
									Erasure coded, in{" "}
									<Link
										to="/collections/$name"
										params={{ name: collectionParam(ec.collection) }}
										className="text-primary hover:underline"
									>
										{collectionLabel(ec.collection)}
									</Link>{" "}
									collection
								</span>
							</span>
						) : (
							loading && <DescriptionGhost width="w-72" />
						)}
					</Swap>
				}
			/>
			<Loaded query={inventory} skeleton={<EcVolumeSkeleton />}>
				{(inv) => (
					<Swap id={ec ? "volume" : "missing"}>
						{ec ? <EcDetail ec={ec} /> : <EcMissing id={volumeId} inventory={inv} />}
					</Swap>
				)}
			</Loaded>
		</>
	);
}

function EcMissing({ id, inventory }: { id: string; inventory: StorageInventory }) {
	const plain = inventory.volumes.some((v) => v.id === Number(id));
	return (
		<EmptyState
			icon={<Blocks />}
			title={plain ? `Volume ${id} is not erasure coded` : `Volume ${id} is not in the cluster`}
			description={plain ? "It is stored as a regular volume with full copies." : "It may have been deleted."}
			action={
				plain ? (
					<Button
						size="sm"
						variant="outline"
						render={<Link to="/volumes/$volumeId" params={{ volumeId: id }} />}
					>
						View the volume
					</Button>
				) : (
					<Button size="sm" variant="outline" render={<Link to="/erasure-coding" />}>
						<ArrowLeft />
						All EC volumes
					</Button>
				)
			}
		/>
	);
}

function EcDetail({ ec }: { ec: EcVolume }) {
	const counts = useMemo(() => shardCounts([ec]), [ec]);
	const palette = useMemo(() => serverPalette([...counts.keys()]), [counts]);
	return (
		<>
			<Collapse open={ec.missingShards.length > 0}>
				<Alert variant="destructive" className="mb-6 rounded-xl">
					<AlertTitle>
						{ec.missingShards.length} {ec.missingShards.length === 1 ? "shard is" : "shards are"} missing
					</AlertTitle>
					<AlertDescription>
						{ec.parityShards > 0 && ec.missingShards.length <= ec.parityShards
							? `The volume is still readable: up to ${ec.parityShards} shards can be lost. Rebuild the missing ones before another server fails — the erasure coding maintenance job does this, or run ec.rebuild in weed shell.`
							: "Too many shards are gone to rebuild this volume. Bring the servers that held them back online."}
					</AlertDescription>
				</Alert>
			</Collapse>
			<StatBand
				stats={[
					{ label: "Stored", value: ec.size, format: formatBytes },
					{ label: "Shards present", value: ec.presentShards.length, hint: `of ${ec.totalShards}` },
					ec.fileCount > 0 || ec.deleteCount > 0
						? { label: "Files", value: ec.fileCount, hint: `${formatCount(ec.deleteCount)} deleted` }
						: {
								label: "Files",
								value: 0,
								format: () => "—",
								hint: "SeaweedFS does not count files in encoded volumes",
							},
					{
						label: "Servers",
						value: ec.placements.length,
						hint: ec.expiresAt ? `Expires ${formatDateTime(ec.expiresAt)}` : "Never expires",
					},
				]}
			/>
			<Section
				title="Shard map"
				description={
					ec.dataShards > 0
						? `${ec.dataShards} data shards and ${ec.parityShards} parity shards. Hover a shard to see where it lives.`
						: `${plural(ec.totalShards, "shard")}. Hover a shard to see where it lives.`
				}
			>
				<FeatureSheet className="space-y-4 overflow-x-auto p-4">
					<ShardMap ec={ec} palette={palette} size="lg" />
					<ServerLegend
						palette={palette}
						counts={counts}
						showMissing={ec.missingShards.length > 0}
						showParity={ec.dataShards > 0}
					/>
				</FeatureSheet>
			</Section>
			<Section title="Servers" description="Where each shard is stored.">
				<DataTable
					data={ec.placements}
					columns={placementColumns(palette)}
					getRowId={(p) => `${p.server}-${p.diskId}`}
					empty={null}
				/>
			</Section>
		</>
	);
}

const NO_SERVERS = new Map<string, number>();

function EcVolumeSkeleton() {
	return (
		<LoadingRegion label="Loading">
			<StatsGhost />
			<Section title="Shard map" description="Hover a shard to see where it lives.">
				<FeatureSheet className="space-y-4 overflow-x-auto p-4">
					<div className="flex flex-wrap items-end gap-4">
						{[10, 4].map((shards) => (
							<div key={shards}>
								<div className="mb-1.5 flex h-5 items-center">
									<SkeletonBlock className="h-3 w-10" />
								</div>
								<div className="flex gap-1 pb-[22px] sm:gap-1.5">
									{Array.from({ length: shards }, (_, i) => (
										// biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders.
										<SkeletonBlock key={i} className="size-6 rounded-[5px] sm:size-7" />
									))}
								</div>
							</div>
						))}
					</div>
					<SkeletonBlock className="h-[18px] w-80 max-w-full max-sm:h-10" />
				</FeatureSheet>
			</Section>
			<Section title="Servers" description="Where each shard is stored.">
				<Frozen>
					<DataTable
						data={undefined}
						isLoading
						columns={ghostCells(placementColumns(NO_SERVERS), 34)}
						getRowId={(p) => p.server}
						empty={null}
					/>
				</Frozen>
			</Section>
		</LoadingRegion>
	);
}
