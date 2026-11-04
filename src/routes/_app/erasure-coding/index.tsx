import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AuroraCard, PageHeader, Reveal, StatBand } from "@/components/kelp/page.tsx";
import { Band, HeroSkeleton } from "@/components/kelp/storage/common.tsx";
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
				description="Erasure coding cuts a volume into shards spread over your servers, so it survives lost disks for a fraction of the space a full copy takes."
				actions={
					// The maintenance area owns this page; a plain link keeps the areas independent.
					<Button variant="secondary" render={<a href="/maintenance/erasure_coding" />}>
						Encoding schedule
					</Button>
				}
			/>
			{data ? (
				<Reveal>
					<AuroraCard className="grid gap-10 p-7 sm:p-9 lg:grid-cols-[auto_1fr] lg:items-end">
						<EcScheme />
						<div className="lg:pl-6">
							<p className="flex items-baseline gap-3">
								<span className="font-[450] text-6xl leading-none tracking-[-0.045em]">1.4×</span>
								<span className="text-foreground/70">the size, instead of 2× or 3× for full copies</span>
							</p>
							<p className="mt-4 max-w-[46ch] text-[15px] text-foreground/70">
								Lose any 4 shards and the volume still reads. Kelp flags a volume the moment a shard goes
								missing.
							</p>
						</div>
					</AuroraCard>
					<Band>
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
					</Band>
				</Reveal>
			) : (
				!error && <HeroSkeleton />
			)}
			<EcVolumeList ecVolumes={ecVolumes} isLoading={isPending} error={error} onRetry={() => refetch()} />
		</>
	);
}
