import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Layers, Trash2 } from "lucide-react";
import { BarList, Columns, dataColor, Ring } from "@/components/kelp/charts/index.ts";
import { ConfirmDialog } from "@/components/kelp/confirm-dialog.tsx";
import {
	EmptyState,
	ErrorState,
	InfoList,
	PageHeader,
	Panel,
	Reveal,
	Section,
	StatBand,
} from "@/components/kelp/page.tsx";
import { GrowVolumesDialog } from "@/components/kelp/storage/cluster-actions.tsx";
import { PageSkeleton } from "@/components/kelp/storage/common.tsx";
import { EcVolumeList } from "@/components/kelp/storage/ec-volume-list.tsx";
import {
	averageObject,
	fillColumns,
	lastWriteColumns,
	volumesPerServer,
} from "@/components/kelp/storage/insights.ts";
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
			</Reveal>
			<div className="mt-3 grid gap-3 xl:grid-cols-12">
				<Panel
					title="Share of the cluster"
					description="This collection against everything else"
					className="min-w-0 xl:col-span-4"
				>
					<Ring
						label="Share of the cluster's stored bytes"
						size={136}
						thickness={14}
						slices={[
							{
								label: collectionLabel(name),
								value: collection.size,
								color: dataColor(0),
								display: formatBytes(collection.size),
							},
							{
								label: "Other collections",
								value: Math.max(0, clusterBytes - collection.size),
								color: "var(--accent)",
								display: formatBytes(Math.max(0, clusterBytes - collection.size)),
							},
						]}
						center={
							<>
								<span className="font-rounded font-semibold text-[20px] leading-6">
									{formatPercent(share)}
								</span>
								<span className="text-[12px] text-muted-foreground">of {formatBytes(clusterBytes)}</span>
							</>
						}
					/>
				</Panel>
				<Panel title="Fill" description="Its volumes by how full they are" className="min-w-0 xl:col-span-4">
					<Columns
						height={150}
						color={dataColor(0)}
						label="This collection's volumes by fill level"
						format={formatCount}
						columns={fillColumns(volumes)}
					/>
				</Panel>
				<Panel title="Last write" description="Hot and cold volumes" className="min-w-0 xl:col-span-4">
					<Columns
						height={150}
						color={dataColor(2)}
						label="This collection's volumes by time since their last write"
						format={formatCount}
						columns={lastWriteColumns(volumes)}
					/>
				</Panel>
			</div>
			<div className="mt-8 grid items-start gap-x-6 gap-y-8 lg:grid-cols-12">
				<Section
					title="Placement"
					description="Volume copies held by each server"
					className="mt-0 lg:col-span-7"
				>
					<div className="group-sheet p-4">
						<BarList label="Volume copies by server" items={volumesPerServer(volumes)} empty="No volumes." />
					</div>
				</Section>
				<Section title="Details" className="mt-0 lg:col-span-5">
					<InfoList
						items={[
							{ label: "Servers", value: formatCount(collection.servers.length) },
							{
								label: "Replication",
								value: <span className="font-mono">{collection.replications.join(", ") || "None"}</span>,
							},
							{ label: "Disk types", value: collection.diskTypes.join(", ") || "None" },
							{ label: "Average object", value: formatBytes(averageObject(collection)) },
							{
								label: "Reclaimable",
								value: `${formatBytes(collection.deletedBytes)} (${formatPercent(ratio(collection.deletedBytes, collection.size))})`,
							},
						]}
					/>
				</Section>
			</div>
			<Section title="Volumes">
				<VolumeTable volumes={volumes} showCollection={false} />
			</Section>
			{ecVolumes.length > 0 && (
				<Section title="Erasure-coded volumes">
					<EcVolumeList ecVolumes={ecVolumes} showCollection={false} />
				</Section>
			)}
		</>
	);
}
