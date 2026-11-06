import type { TopologyDataCenter } from "@shared/api.ts";
import { useQuery } from "@tanstack/react-query";
import { Server } from "lucide-react";
import { AuroraCard, CapacityBar, SkeletonBlock } from "@/components/kelp/page.tsx";
import { LoadingRegion } from "@/components/kelp/skeletons.tsx";
import { TextMorph } from "@/components/kelp/text-morph.tsx";
import { Loaded } from "@/components/kelp/transitions.tsx";
import { formatBytes, plural } from "@/lib/format.ts";
import { queries } from "@/lib/queries.ts";

/**
 * The cluster's shape: data centers side by side, racks inside them, and every volume server as a
 * row with its live fill level.
 */
export function TopologyMap() {
	const { data, error } = useQuery(queries.topology());
	return (
		<Loaded className="mt-3" query={{ data, error }} skeleton={<TopologySkeleton />}>
			{(dataCenters) => <Topology dataCenters={dataCenters} />}
		</Loaded>
	);
}

function Topology({ dataCenters }: { dataCenters: TopologyDataCenter[] }) {
	const racks = dataCenters.reduce((sum, dc) => sum + dc.racks.length, 0);
	return (
		<AuroraCard className="p-4">
			<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<h2 className="font-semibold text-[13px]">Topology</h2>
				<p className="text-[12px] text-muted-foreground">
					<TextMorph>
						{`${dataCenters.length} ${dataCenters.length === 1 ? "data center" : "data centers"}, ${racks} ${racks === 1 ? "rack" : "racks"}`}
					</TextMorph>
				</p>
			</div>
			<div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{dataCenters.map((dc) => (
					<section key={dc.id} className="min-w-0">
						<h3 className="font-medium text-[13px]">{dc.id}</h3>
						<div className="mt-2 space-y-3">
							{dc.racks.map((rack) => (
								<div key={rack.id}>
									<p className="mb-1 text-[12px] text-muted-foreground">{rack.id}</p>
									<ul className="space-y-1">
										{rack.nodes.map((node) => (
											<li key={node.id} className="rounded-lg bg-raised px-3 py-2">
												<div className="flex items-center justify-between gap-2 text-[13px]">
													<span className="flex min-w-0 items-center gap-1.5">
														<Server className="size-3.5 shrink-0 text-muted-foreground" />
														<span className="truncate font-mono">{node.address}</span>
													</span>
													<span className="shrink-0 text-[12px] text-muted-foreground tabular">
														<TextMorph>{plural(node.volumes, "volume")}</TextMorph>
													</span>
												</div>
												<div className="mt-2 flex items-center gap-3">
													<CapacityBar used={node.diskUsage} total={node.diskCapacity} />
													<span className="shrink-0 text-[12px] text-muted-foreground tabular">
														<TextMorph>
															{`${formatBytes(node.diskUsage)} of ${formatBytes(node.diskCapacity)}`}
														</TextMorph>
													</span>
												</div>
											</li>
										))}
									</ul>
								</div>
							))}
						</div>
					</section>
				))}
			</div>
		</AuroraCard>
	);
}

/** One rack with one node: the smallest real shape, so a cluster only ever grows from the ghost. */
function TopologySkeleton() {
	return (
		<LoadingRegion label="Loading topology">
			<AuroraCard className="p-4">
				<div className="flex items-baseline justify-between gap-4">
					<h2 className="font-semibold text-[13px]">Topology</h2>
					<SkeletonBlock className="h-3 w-32" />
				</div>
				<div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					<div>
						<div className="flex h-5 items-center">
							<SkeletonBlock className="h-3.5 w-36" />
						</div>
						<div className="mt-2 mb-1 flex h-5 items-center">
							<SkeletonBlock className="h-3 w-24" />
						</div>
						<div className="space-y-2 rounded-lg bg-raised px-3 py-2">
							<div className="flex h-5 items-center">
								<SkeletonBlock className="h-3.5 w-full" />
							</div>
							<div className="flex h-5 items-center">
								<SkeletonBlock className="h-1.5 w-full" />
							</div>
						</div>
					</div>
				</div>
			</AuroraCard>
		</LoadingRegion>
	);
}
