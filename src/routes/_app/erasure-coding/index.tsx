import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AuroraCard, PageHeader, Reveal, StatBand } from "@/components/kelp/page.tsx";
import { HeroSkeleton } from "@/components/kelp/storage/common.tsx";
import { EcVolumeList } from "@/components/kelp/storage/ec-volume-list.tsx";
import { EcScheme } from "@/components/kelp/storage/visuals.tsx";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/format.ts";
import { storageQueries } from "@/lib/storage-queries.ts";

export const Route = createFileRoute("/_app/erasure-coding/")({
	staticData: { section: "Storage", title: "Erasure coding" },
	loader: ({ context }) => void context.queryClient.prefetchQuery(storageQueries.inventory()),
	component: ErasureCodingPage,
});

function ErasureCodingPage() {
	const { data, isPending, error, refetch } = useQuery(storageQueries.inventory());
	const ecVolumes = data?.ecVolumes;
	const servers = new Set(ecVolumes?.flatMap((ec) => ec.placements.map((p) => p.server)) ?? []).size;
	const damaged = ecVolumes?.filter((ec) => ec.missingShards.length > 0).length ?? 0;

	return (
		<>
			<PageHeader
				title="Erasure coding"
				description="Volumes cut into shards across servers, surviving lost disks for a fraction of a full copy."
				actions={
					// The maintenance area owns this page; a plain link keeps the areas independent.
					<Button variant="secondary" render={<a href="/maintenance/erasure_coding" />}>
						Encoding schedule
					</Button>
				}
			/>
			{data ? (
				<Reveal>
					<StatBand
						stats={[
							{ label: "Encoded volumes", value: data.ecVolumes.length },
							{
								label: "Shards",
								value: data.totals.ecShards,
								hint: `on ${servers} ${servers === 1 ? "server" : "servers"}`,
							},
							{
								label: "Stored",
								value: data.ecVolumes.reduce((sum, ec) => sum + ec.size, 0),
								format: formatBytes,
							},
							{
								label: "Missing shards",
								value: data.ecVolumes.reduce((sum, ec) => sum + ec.missingShards.length, 0),
								hint:
									damaged > 0
										? `${damaged} ${damaged === 1 ? "volume needs" : "volumes need"} a rebuild`
										: "Every volume is complete",
							},
						]}
					/>
					<AuroraCard className="mt-3 flex flex-wrap items-center gap-x-10 gap-y-4 p-4">
						<EcScheme />
						<div className="min-w-0 flex-1">
							<p className="flex items-baseline gap-2">
								<span className="metric font-semibold text-[20px]">1.4×</span>
								<span className="text-[13px] text-muted-foreground">
									the size, instead of 2× or 3× for full copies
								</span>
							</p>
							<p className="mt-1 max-w-[60ch] text-[13px] text-muted-foreground">
								Lose any 4 shards and the volume still reads. Kelp flags a volume the moment a shard goes
								missing.
							</p>
						</div>
					</AuroraCard>
				</Reveal>
			) : (
				!error && <HeroSkeleton />
			)}
			<div className="mt-8">
				<EcVolumeList ecVolumes={ecVolumes} isLoading={isPending} error={error} onRetry={() => refetch()} />
			</div>
		</>
	);
}
