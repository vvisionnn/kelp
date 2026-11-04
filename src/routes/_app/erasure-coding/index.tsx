import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Blocks, HardDrive, Server, ShieldAlert, ShieldCheck } from "lucide-react";
import { PageHeader, Reveal, StatTile } from "@/components/kelp/page.tsx";
import { Tiles, TilesSkeleton } from "@/components/kelp/storage/common.tsx";
import { EcVolumeList } from "@/components/kelp/storage/ec-volume-list.tsx";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/format.ts";
import { storageQueries } from "@/lib/storage-queries.ts";

export const Route = createFileRoute("/_app/erasure-coding/")({
	staticData: { section: "Storage", title: "Erasure coding" },
	loader: ({ context }) => context.queryClient.prefetchQuery(storageQueries.inventory()),
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
				description="Each erasure-coded volume is cut into 10 data shards and 4 parity shards spread over your servers. Any 10 shards rebuild it, so it survives losing 4 while taking 1.4× its size."
				actions={
					// The maintenance area owns this page; a plain link keeps the areas independent.
					<Button size="sm" variant="outline" render={<a href="/maintenance/erasure_coding" />}>
						Encoding schedule
					</Button>
				}
			/>
			{data ? (
				<Reveal>
					<Tiles>
						<StatTile label="Encoded volumes" value={data.ecVolumes.length} icon={<Blocks />} />
						<StatTile
							label="Shards"
							value={data.totals.ecShards}
							icon={<Server />}
							hint={`on ${servers} ${servers === 1 ? "server" : "servers"}`}
						/>
						<StatTile
							label="Stored"
							value={data.ecVolumes.reduce((sum, ec) => sum + ec.size, 0)}
							format={formatBytes}
							icon={<HardDrive />}
						/>
						<StatTile
							label="Missing shards"
							value={data.ecVolumes.reduce((sum, ec) => sum + ec.missingShards.length, 0)}
							icon={damaged > 0 ? <ShieldAlert /> : <ShieldCheck />}
							hint={
								damaged > 0
									? `${damaged} ${damaged === 1 ? "volume needs" : "volumes need"} a rebuild`
									: "Every volume is complete"
							}
						/>
					</Tiles>
				</Reveal>
			) : (
				!error && <TilesSkeleton />
			)}
			<div className="mt-6">
				<EcVolumeList ecVolumes={ecVolumes} isLoading={isPending} error={error} onRetry={() => refetch()} />
			</div>
		</>
	);
}
