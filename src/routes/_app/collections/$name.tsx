import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Layers, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/kelp/confirm-dialog.tsx";
import { AuroraCard, EmptyState, ErrorState, PageHeader, Reveal, StatBand } from "@/components/kelp/page.tsx";
import { GrowVolumesDialog } from "@/components/kelp/storage/cluster-actions.tsx";
import { Band, PageSkeleton, SectionTitle } from "@/components/kelp/storage/common.tsx";
import { EcVolumeList } from "@/components/kelp/storage/ec-volume-list.tsx";
import { ShareBar } from "@/components/kelp/storage/visuals.tsx";
import { VolumeTable } from "@/components/kelp/storage/volume-table.tsx";
import { Button } from "@/components/ui/button";
import { formatBytes, formatCount, formatPercent, ratio } from "@/lib/format.ts";
import { useAction } from "@/lib/mutations.ts";
import { useCanWrite } from "@/lib/session.ts";
import {
	collectionFromParam,
	collectionLabel,
	storageApi,
	storageKey,
	storageQueries,
} from "@/lib/storage-queries.ts";

export const Route = createFileRoute("/_app/collections/$name")({
	staticData: { section: "Storage", title: "Collections" },
	loader: ({ context }) => void context.queryClient.prefetchQuery(storageQueries.inventory()),
	component: CollectionPage,
});

function DeleteCollection({ name }: { name: string }) {
	const navigate = useNavigate();
	const remove = useAction({
		run: () => storageApi.deleteCollection(name),
		success: `Collection ${name} deleted`,
		invalidate: [storageKey],
		onSuccess: () => navigate({ to: "/collections" }),
	});
	return (
		<ConfirmDialog
			trigger={
				<Button variant="destructive">
					<Trash2 />
					Delete collection
				</Button>
			}
			title={`Delete collection ${name}?`}
			description="Every volume and erasure-coded shard in this collection is deleted from every server, with all the files inside. This cannot be undone."
			confirmLabel="Delete collection"
			destructive
			typeToConfirm={name}
			onConfirm={() => remove.mutateAsync()}
		/>
	);
}

function CollectionPage() {
	const { name: param } = Route.useParams();
	const name = collectionFromParam(param);
	const canWrite = useCanWrite();
	const { data, error, refetch } = useQuery(storageQueries.inventory());

	if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
	if (!data) return <PageSkeleton />;
	const collection = data.collections.find((c) => c.name === name);
	if (!collection) {
		return (
			<EmptyState
				icon={<Layers />}
				title={`No collection named ${collectionLabel(name)}`}
				description="It has no volumes. It may have been deleted, or never stored anything."
				action={
					<Button size="sm" variant="outline" render={<Link to="/collections" />}>
						<ArrowLeft />
						All collections
					</Button>
				}
			/>
		);
	}
	const volumes = data.volumes.filter((v) => v.collection === name);
	const ecVolumes = data.ecVolumes.filter((v) => v.collection === name);

	const clusterBytes = data.collections.reduce((sum, c) => sum + c.size, 0);
	const share = ratio(collection.size, clusterBytes);

	return (
		<>
			<PageHeader
				title={collectionLabel(name)}
				description={
					name
						? `${collection.servers.length} ${collection.servers.length === 1 ? "server holds" : "servers hold"} this collection.`
						: "Data written without a collection lands here. It cannot be deleted as a whole."
				}
				actions={
					canWrite && (
						<>
							<GrowVolumesDialog inventory={data} collection={name} />
							{name && <DeleteCollection name={name} />}
						</>
					)
				}
			/>
			<Reveal>
				<AuroraCard className="p-7 sm:p-9">
					<div className="flex items-center justify-between text-[13px] text-foreground/70">
						<span>Share of the cluster</span>
						<span>{formatBytes(clusterBytes)} stored in total</span>
					</div>
					<p className="mt-10 flex flex-wrap items-baseline gap-x-3">
						<span className="font-[450] text-6xl leading-none tracking-[-0.045em]">
							{formatPercent(share)}
						</span>
						<span className="text-foreground/70">of every stored byte lives here</span>
					</p>
					<ShareBar fraction={share} />
				</AuroraCard>
				<Band>
					<StatBand
						stats={[
							{ label: "Stored", value: collection.size, format: formatBytes },
							{
								label: "Files",
								value: collection.fileCount,
								hint: `${formatCount(collection.deleteCount)} deleted`,
							},
							{ label: "Volumes", value: collection.volumeCount },
							{ label: "Erasure coded", value: collection.ecVolumeCount, hint: "volumes" },
						]}
					/>
				</Band>
			</Reveal>
			<section>
				<SectionTitle title="Volumes" />
				<VolumeTable volumes={volumes} showCollection={false} />
			</section>
			{ecVolumes.length > 0 && (
				<section className="mt-16">
					<SectionTitle title="Erasure-coded volumes" />
					<EcVolumeList ecVolumes={ecVolumes} showCollection={false} />
				</section>
			)}
		</>
	);
}
