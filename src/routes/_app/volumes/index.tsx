import type { StorageInventory } from "@shared/storage.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Database, Eraser, HardDrive, Lock, TriangleAlert } from "lucide-react";
import { z } from "zod";
import { PageHeader, Reveal, StatTile } from "@/components/kelp/page.tsx";
import { GrowVolumesDialog, VacuumClusterDialog } from "@/components/kelp/storage/cluster-actions.tsx";
import { Tiles, TilesSkeleton } from "@/components/kelp/storage/common.tsx";
import { VolumeTable } from "@/components/kelp/storage/volume-table.tsx";
import { formatBytes, formatCount, formatPercent, ratio } from "@/lib/format.ts";
import { useCanWrite } from "@/lib/session.ts";
import { storageQueries, VACUUM_THRESHOLD, volumeHealth } from "@/lib/storage-queries.ts";

export const Route = createFileRoute("/_app/volumes/")({
	staticData: { section: "Storage", title: "Volumes" },
	validateSearch: z.object({ filter: z.enum(["all", "attention", "read-only", "vacuum"]).optional() }),
	loader: ({ context }) => context.queryClient.prefetchQuery(storageQueries.inventory()),
	component: VolumesPage,
});

/** One sentence that sizes up the volume fleet for the page header. */
export function volumesSummary(inventory: StorageInventory): string {
	const servers = new Set(inventory.volumes.flatMap((v) => v.replicas.map((r) => r.server))).size;
	const count = inventory.volumes.length;
	if (count === 0) return "No volumes yet. SeaweedFS creates them as data arrives.";
	return `${formatCount(count)} ${count === 1 ? "volume" : "volumes"} on ${servers} ${
		servers === 1 ? "server" : "servers"
	}. Each grows to ${formatBytes(inventory.volumeSizeLimitBytes)} before SeaweedFS opens another.`;
}

function VolumesPage() {
	const { filter } = Route.useSearch();
	const canWrite = useCanWrite();
	const { data, isPending, error, refetch } = useQuery(storageQueries.inventory());
	const volumes = data?.volumes;
	const stored = volumes?.reduce((sum, v) => sum + v.size, 0) ?? 0;
	const garbage = volumes?.reduce((sum, v) => sum + v.deletedBytes, 0) ?? 0;
	const needsVacuum = volumes?.filter((v) => v.garbageRatio >= VACUUM_THRESHOLD).length ?? 0;
	const attention = volumes?.filter((v) => volumeHealth(v).tone !== "good").length ?? 0;
	const readOnly = volumes?.filter((v) => v.readOnly).length ?? 0;
	const freeSlots = data?.disks.reduce((sum, d) => sum + d.freeVolumeCount, 0) ?? 0;

	return (
		<>
			<PageHeader
				title="Volumes"
				description={data ? volumesSummary(data) : "Where your data lives."}
				actions={
					canWrite && (
						<>
							<VacuumClusterDialog inventory={data} />
							<GrowVolumesDialog inventory={data} />
						</>
					)
				}
			/>
			{data ? (
				<Reveal>
					<Tiles>
						<StatTile
							label="Volumes"
							value={data.volumes.length}
							icon={<HardDrive />}
							hint={`${formatCount(freeSlots)} free slots`}
						/>
						<StatTile
							label="Stored"
							value={stored}
							format={formatBytes}
							icon={<Database />}
							hint={`${formatCount(data.totals.files)} files`}
						/>
						<StatTile
							label="Reclaimable"
							value={garbage}
							format={formatBytes}
							icon={<Eraser />}
							hint={
								needsVacuum > 0
									? `${needsVacuum} ${needsVacuum === 1 ? "volume needs" : "volumes need"} a vacuum`
									: `${formatPercent(ratio(garbage, stored))} of stored bytes`
							}
						/>
						<StatTile
							label="Needs attention"
							value={attention}
							icon={attention > 0 ? <TriangleAlert /> : <Lock />}
							hint={`${readOnly} read-only`}
						/>
					</Tiles>
				</Reveal>
			) : (
				!error && <TilesSkeleton />
			)}
			<div className="mt-6">
				<VolumeTable
					volumes={volumes}
					isLoading={isPending}
					error={error}
					onRetry={() => refetch()}
					{...(filter ? { initialFilter: filter } : {})}
				/>
			</div>
		</>
	);
}
