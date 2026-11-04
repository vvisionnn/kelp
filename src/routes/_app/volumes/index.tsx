import type { StorageInventory } from "@shared/storage.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AuroraCard, PageHeader, Reveal, StatBand } from "@/components/kelp/page.tsx";
import { GrowVolumesDialog, VacuumClusterDialog } from "@/components/kelp/storage/cluster-actions.tsx";
import { HeroSkeleton, SheetCaption } from "@/components/kelp/storage/common.tsx";
import { VolumeSkyline } from "@/components/kelp/storage/visuals.tsx";
import { VolumeTable } from "@/components/kelp/storage/volume-table.tsx";
import { formatBytes, formatCount, formatPercent, ratio } from "@/lib/format.ts";
import { useCanWrite } from "@/lib/session.ts";
import { storageQueries, VACUUM_THRESHOLD, volumeHealth } from "@/lib/storage-queries.ts";

export const Route = createFileRoute("/_app/volumes/")({
	staticData: { section: "Storage", title: "Volumes" },
	validateSearch: z.object({ filter: z.enum(["all", "attention", "read-only", "vacuum"]).optional() }),
	loader: ({ context }) => void context.queryClient.prefetchQuery(storageQueries.inventory()),
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
					<StatBand
						stats={[
							{
								label: "Volumes",
								value: data.volumes.length,
								hint: `${formatCount(freeSlots)} free slots`,
							},
							{ label: "Files", value: data.totals.files, hint: `in ${formatBytes(stored)}` },
							{
								label: "Reclaimable",
								value: garbage,
								format: formatBytes,
								hint:
									needsVacuum > 0
										? `${needsVacuum} ${needsVacuum === 1 ? "volume needs" : "volumes need"} a vacuum`
										: `${formatPercent(ratio(garbage, stored))} of stored bytes`,
							},
							{ label: "Needs attention", value: attention, hint: `${readOnly} read-only` },
						]}
					/>
					{data.volumes.length > 0 && (
						<AuroraCard className="mt-3 p-4">
							<SheetCaption title="Fill by volume">
								{formatBytes(stored)} stored, each bar is one volume
							</SheetCaption>
							<VolumeSkyline volumes={data.volumes} limit={data.volumeSizeLimitBytes} className="mt-3" />
						</AuroraCard>
					)}
				</Reveal>
			) : (
				!error && <HeroSkeleton />
			)}
			<div className="mt-8">
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
