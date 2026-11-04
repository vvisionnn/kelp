import type { EcPlacement } from "@shared/storage.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Blocks } from "lucide-react";
import { useMemo } from "react";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import {
	AuroraCard,
	EmptyState,
	ErrorState,
	PageHeader,
	Reveal,
	StatBand,
	StatusDot,
} from "@/components/kelp/page.tsx";
import { Band, PageSkeleton, SectionTitle } from "@/components/kelp/storage/common.tsx";
import { ecHealth, shardCounts } from "@/components/kelp/storage/ec-volume-list.tsx";
import { ServerLegend, ShardMap, serverFill, shardRanges } from "@/components/kelp/storage/shard-map.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { Button } from "@/components/ui/button";
import { formatBytes, formatCount, formatDateTime } from "@/lib/format.ts";
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
	const { data, error, refetch } = useQuery(storageQueries.inventory());
	const ec = data?.ecVolumes.find((v) => v.id === Number(volumeId));
	const counts = useMemo(() => shardCounts(ec ? [ec] : []), [ec]);
	const palette = useMemo(() => serverPalette([...counts.keys()]), [counts]);

	if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
	if (!data) return <PageSkeleton />;
	if (!ec) {
		const plain = data.volumes.some((v) => v.id === Number(volumeId));
		return (
			<EmptyState
				icon={<Blocks />}
				title={plain ? `Volume ${volumeId} is not erasure coded` : `Volume ${volumeId} is not in the cluster`}
				description={
					plain ? "It is stored as a regular volume with full copies." : "It may have been deleted."
				}
				action={
					plain ? (
						<Button
							size="sm"
							variant="outline"
							render={<Link to="/volumes/$volumeId" params={{ volumeId }} />}
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

	const health = ecHealth(ec);
	return (
		<>
			<PageHeader
				title={`Volume ${ec.id}`}
				description={
					<span className="flex flex-wrap items-center gap-x-3 gap-y-1">
						<StatusDot tone={health.tone} label={health.label} />
						<span>
							Erasure coded, in{" "}
							<Link
								to="/collections/$name"
								params={{ name: collectionParam(ec.collection) }}
								className="font-medium text-foreground underline decoration-foreground/20 underline-offset-4 hover:decoration-foreground"
							>
								{collectionLabel(ec.collection)}
							</Link>{" "}
							collection
						</span>
					</span>
				}
			/>
			{ec.missingShards.length > 0 && (
				<Alert variant="destructive" className="mb-8 rounded-2xl">
					<AlertTitle>
						{ec.missingShards.length} {ec.missingShards.length === 1 ? "shard is" : "shards are"} missing
					</AlertTitle>
					<AlertDescription>
						{ec.parityShards > 0 && ec.missingShards.length <= ec.parityShards
							? `The volume is still readable: up to ${ec.parityShards} shards can be lost. Rebuild the missing ones before another server fails — the erasure coding maintenance job does this, or run ec.rebuild in weed shell.`
							: "Too many shards are gone to rebuild this volume. Bring the servers that held them back online."}
					</AlertDescription>
				</Alert>
			)}
			<Reveal>
				<AuroraCard className="p-7 sm:p-9">
					<div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
						<h2 className="font-medium text-[15px]">Shard map</h2>
						<p className="text-[13px] text-foreground/70">
							{ec.dataShards > 0
								? `${ec.dataShards} data shards and ${ec.parityShards} parity shards. Hover a shard to see where it lives.`
								: `${ec.totalShards} shards. Hover a shard to see where it lives.`}
						</p>
					</div>
					<div className="mt-10 space-y-8 overflow-x-auto">
						<ShardMap ec={ec} palette={palette} size="lg" />
						<ServerLegend
							palette={palette}
							counts={counts}
							showMissing={ec.missingShards.length > 0}
							showParity={ec.dataShards > 0}
						/>
					</div>
				</AuroraCard>
				<Band>
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
				</Band>
			</Reveal>
			<section>
				<SectionTitle title="Servers" description="Where each shard is stored." />
				<DataTable
					data={ec.placements}
					columns={placementColumns(palette)}
					getRowId={(p) => `${p.server}-${p.diskId}`}
					empty={null}
				/>
			</section>
		</>
	);
}
