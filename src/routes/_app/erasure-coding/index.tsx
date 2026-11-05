import type { StorageInventory } from "@shared/storage.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Columns, dataColor, Kpi, Ring, splitUnit } from "@/components/kelp/charts/index.ts";
import { PageHeader, Panel, Reveal } from "@/components/kelp/page.tsx";
import { HeroSkeleton } from "@/components/kelp/storage/common.tsx";
import { EcVolumeList } from "@/components/kelp/storage/ec-volume-list.tsx";
import { ecSavings, protectionSlices, shardsPerServer } from "@/components/kelp/storage/insights.ts";
import { EcScheme } from "@/components/kelp/storage/visuals.tsx";
import { Button } from "@/components/ui/button";
import { formatBytes, formatCount, formatPercent, ratio } from "@/lib/format.ts";
import { storageQueries } from "@/lib/storage-queries.ts";

export const Route = createFileRoute("/_app/erasure-coding/")({
	staticData: { section: "Storage", title: "Erasure coding" },
	loader: ({ context }) => void context.queryClient.prefetchQuery(storageQueries.inventory()),
	component: ErasureCodingPage,
});

function ErasureCodingPage() {
	const { data, isPending, error, refetch } = useQuery(storageQueries.inventory());
	const ecVolumes = data?.ecVolumes;

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
					<EcNumbers inventory={data} />
					<EcCharts inventory={data} />
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

function EcNumbers({ inventory }: { inventory: StorageInventory }) {
	const ec = inventory.ecVolumes;
	const servers = new Set(ec.flatMap((v) => v.placements.map((p) => p.server))).size;
	const missing = ec.reduce((sum, v) => sum + v.missingShards.length, 0);
	const damaged = ec.filter((v) => v.missingShards.length > 0).length;
	const savings = ecSavings(ec);
	const encodedShare = ratio(ec.length, ec.length + inventory.volumes.length);
	return (
		<div className="grid grid-cols-2 gap-3 max-sm:[&_section_svg]:hidden md:grid-cols-3 xl:grid-cols-6">
			<Kpi
				label="Encoded volumes"
				value={formatCount(ec.length)}
				hint={`${formatPercent(encodedShare)} of all volumes`}
			/>
			<Kpi
				label="Shards"
				value={formatCount(inventory.totals.ecShards)}
				hint={`on ${servers} ${servers === 1 ? "server" : "servers"}`}
			/>
			<Kpi
				label="Stored as shards"
				{...splitUnit(formatBytes(savings.stored))}
				hint={`${formatBytes(savings.data)} of data`}
			/>
			<Kpi
				label="Space saved"
				{...splitUnit(formatBytes(savings.saved))}
				hint="Against two full copies"
				color={dataColor(2)}
			/>
			<Kpi
				label="Missing shards"
				value={formatCount(missing)}
				hint={
					damaged > 0
						? `${damaged} ${damaged === 1 ? "volume needs" : "volumes need"} a rebuild`
						: "Every volume is complete"
				}
				{...(missing > 0 ? { tone: "bad" as const } : {})}
			/>
			<Kpi
				label="Duplicate shards"
				value={formatCount(ec.reduce((sum, v) => sum + v.duplicateShards.length, 0))}
				hint="Stored on two disks"
			/>
		</div>
	);
}

function EcCharts({ inventory }: { inventory: StorageInventory }) {
	const perServer = shardsPerServer(inventory.ecVolumes);
	const protection = protectionSlices(inventory);
	const total = protection.reduce((sum, s) => sum + s.value, 0);
	return (
		<div className="mt-3 grid gap-3 xl:grid-cols-12">
			<Panel
				title="Shards per server"
				description="An even spread survives the loss of any one server"
				className="min-w-0 xl:col-span-5"
			>
				{perServer.length > 0 ? (
					<Columns
						height={170}
						color={dataColor(3)}
						label="EC shards held by each server"
						format={formatCount}
						columns={perServer}
					/>
				) : (
					<p className="py-10 text-center text-[13px] text-muted-foreground">
						No volume is erasure coded yet.
					</p>
				)}
			</Panel>
			<Panel
				title="Protection"
				description="Bytes on disk by how they are protected"
				className="min-w-0 xl:col-span-4"
			>
				<Ring
					label="Bytes on disk by protection"
					size={136}
					thickness={14}
					slices={protection}
					center={
						<>
							<span className="font-rounded font-semibold text-[20px] leading-6">
								{formatPercent(ratio(protection[1]?.value ?? 0, total))}
							</span>
							<span className="text-[12px] text-muted-foreground">as shards</span>
						</>
					}
				/>
			</Panel>
			<Panel title="How it works" className="min-w-0 xl:col-span-3">
				<EcScheme />
				<p className="mt-3 text-[13px] text-muted-foreground">
					<span className="font-semibold text-foreground">1.4×</span> the size instead of 2× or 3× for full
					copies. Lose any 4 shards and the volume still reads.
				</p>
			</Panel>
		</div>
	);
}
