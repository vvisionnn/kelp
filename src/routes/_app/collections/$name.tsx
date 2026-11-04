import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Blocks, FileStack, HardDrive, Layers, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/kelp/confirm-dialog.tsx";
import {
	EmptyState,
	ErrorState,
	PageHeader,
	Panel,
	Reveal,
	SkeletonBlock,
	StatTile,
} from "@/components/kelp/page.tsx";
import { GrowVolumesDialog } from "@/components/kelp/storage/cluster-actions.tsx";
import { Tiles, TilesSkeleton } from "@/components/kelp/storage/common.tsx";
import { EcVolumeList } from "@/components/kelp/storage/ec-volume-list.tsx";
import { VolumeTable } from "@/components/kelp/storage/volume-table.tsx";
import { Button } from "@/components/ui/button";
import { formatBytes, formatCount } from "@/lib/format.ts";
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
	loader: ({ context }) => context.queryClient.prefetchQuery(storageQueries.inventory()),
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
				<Button size="sm" variant="destructive">
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
	if (!data) {
		return (
			<>
				<SkeletonBlock className="mt-2 mb-6 h-8 w-48" />
				<TilesSkeleton />
			</>
		);
	}
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

	return (
		<>
			<PageHeader
				title={collectionLabel(name)}
				description={
					name
						? `${collection.servers.length} ${collection.servers.length === 1 ? "server" : "servers"} hold this collection.`
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
				<Tiles>
					<StatTile label="Stored" value={collection.size} format={formatBytes} icon={<HardDrive />} />
					<StatTile
						label="Files"
						value={collection.fileCount}
						icon={<FileStack />}
						hint={`${formatCount(collection.deleteCount)} deleted`}
					/>
					<StatTile label="Volumes" value={collection.volumeCount} icon={<HardDrive />} />
					<StatTile label="Erasure coded" value={collection.ecVolumeCount} icon={<Blocks />} hint="volumes" />
				</Tiles>
			</Reveal>
			<div className="mt-6 space-y-6">
				<Panel title="Volumes">
					<VolumeTable volumes={volumes} showCollection={false} />
				</Panel>
				{ecVolumes.length > 0 && (
					<Panel title="Erasure-coded volumes">
						<EcVolumeList ecVolumes={ecVolumes} showCollection={false} />
					</Panel>
				)}
			</div>
		</>
	);
}
