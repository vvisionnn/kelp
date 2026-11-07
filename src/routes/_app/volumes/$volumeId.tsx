import type { StorageInventory, StorageVolume, VolumeReplica } from "@shared/storage.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Eraser, HardDrive, Lock, LockOpen } from "lucide-react";
import { BarList, dataColor } from "@/components/kelp/charts/index.ts";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import {
	EmptyState,
	FeatureSheet,
	InfoList,
	PageHeader,
	Section,
	SkeletonBlock,
	StatBand,
	StatusDot,
} from "@/components/kelp/page.tsx";
import { LoadingRegion } from "@/components/kelp/skeletons.tsx";
import { describeReplication } from "@/components/kelp/storage/cluster-actions.tsx";
import {
	DescriptionGhost,
	Frozen,
	ghostCells,
	SheetCaption,
	StatsGhost,
	ValueGhost,
} from "@/components/kelp/storage/common.tsx";
import { fleetRank } from "@/components/kelp/storage/insights.ts";
import { FillGauge } from "@/components/kelp/storage/visuals.tsx";
import { useVolumeActions } from "@/components/kelp/storage/volume-actions.ts";
import { RollingValue, TextMorph } from "@/components/kelp/text-morph.tsx";
import { Loaded, Swap } from "@/components/kelp/transitions.tsx";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { formatBytes, formatCount, formatDateTime, formatPercent, formatRelative } from "@/lib/format.ts";
import { useCanWrite } from "@/lib/session.ts";
import { collectionLabel, collectionParam, storageQueries, volumeHealth } from "@/lib/storage-queries.ts";

export const Route = createFileRoute("/_app/volumes/$volumeId")({
	staticData: { section: "Storage", title: "Volumes", crumb: ({ volumeId }) => `Volume ${volumeId}` },
	loader: ({ context }) => void context.queryClient.prefetchQuery(storageQueries.inventory()),
	component: VolumePage,
});

function ReplicaSwitch({ volume, replica }: { volume: StorageVolume; replica: VolumeReplica }) {
	const { setReadOnly } = useVolumeActions();
	return (
		<Switch
			checked={!replica.readOnly}
			disabled={setReadOnly.isPending}
			aria-label={`Accept writes on ${replica.server}`}
			onCheckedChange={(writable) =>
				setReadOnly.mutate({ volumes: [{ ...volume, replicas: [replica] }], readOnly: !writable })
			}
		/>
	);
}

function replicaColumns(volume: StorageVolume, canWrite: boolean): Array<Column<VolumeReplica>> {
	return [
		{
			accessorKey: "server",
			header: "Server",
			cell: ({ row }) => (
				<div>
					<p className="font-mono">{row.original.server}</p>
					<p className="text-muted-foreground text-xs">
						{row.original.dataCenter} / {row.original.rack}
					</p>
				</div>
			),
			size: 240,
		},
		{
			id: "disk",
			header: "Disk",
			size: 100,
			cell: ({ row }) => (
				<span>
					{row.original.diskType} <span className="text-muted-foreground">#{row.original.diskId}</span>
				</span>
			),
		},
		{
			accessorKey: "size",
			header: "Size",
			size: 110,
			cell: ({ row }) => <span className="tabular">{formatBytes(row.original.size)}</span>,
		},
		{
			accessorKey: "fileCount",
			header: "Files",
			size: 150,
			cell: ({ row }) => (
				<span className="tabular">
					{formatCount(row.original.fileCount)}
					{row.original.deleteCount > 0 && (
						<span className="text-muted-foreground">, {formatCount(row.original.deleteCount)} deleted</span>
					)}
				</span>
			),
		},
		{
			accessorKey: "compactRevision",
			header: "Compactions",
			size: 120,
			cell: ({ row }) => <span className="tabular">{row.original.compactRevision}</span>,
		},
		{
			accessorKey: "modifiedAt",
			header: "Last write",
			size: 120,
			cell: ({ row }) => (
				<span className="text-muted-foreground text-xs">{formatRelative(row.original.modifiedAt)}</span>
			),
		},
		{
			id: "writes",
			header: "Writes",
			size: 90,
			cell: ({ row }) =>
				canWrite ? (
					<ReplicaSwitch volume={volume} replica={row.original} />
				) : (
					<StatusDot
						tone={row.original.readOnly ? "idle" : "good"}
						label={row.original.readOnly ? "Read-only" : "Writable"}
					/>
				),
			enableSorting: false,
		},
	];
}

function VolumeActions({ volume }: { volume: StorageVolume }) {
	const { vacuum, setReadOnly } = useVolumeActions();
	return (
		<>
			<Button
				variant="secondary"
				disabled={vacuum.isPending}
				pending={vacuum.isPending}
				onClick={() => vacuum.mutate([volume])}
			>
				<Eraser />
				Vacuum volume
			</Button>
			<Button
				disabled={setReadOnly.isPending}
				pending={setReadOnly.isPending}
				onClick={() => setReadOnly.mutate({ volumes: [volume], readOnly: !volume.readOnly })}
			>
				{volume.readOnly ? <LockOpen /> : <Lock />}
				<TextMorph>{volume.readOnly ? "Make writable" : "Make read-only"}</TextMorph>
			</Button>
		</>
	);
}

function VolumePage() {
	const { volumeId } = Route.useParams();
	const id = Number(volumeId);
	const canWrite = useCanWrite();
	const inventory = useQuery(storageQueries.inventory());
	const { data, error } = inventory;
	const volume = data?.volumes.find((v) => v.id === id);
	const loading = !data && !error;
	const health = volume && volumeHealth(volume);

	return (
		<>
			<PageHeader
				title={`Volume ${volumeId}`}
				description={
					<Swap id={volume ? "volume" : loading ? "pending" : "none"}>
						{volume && health ? (
							<span className="flex flex-wrap items-center gap-x-3 gap-y-1">
								<StatusDot tone={health.tone} label={health.label} />
								<span>
									In{" "}
									<Link
										to="/collections/$name"
										params={{ name: collectionParam(volume.collection) }}
										className="text-primary hover:underline"
									>
										{collectionLabel(volume.collection)}
									</Link>{" "}
									collection
								</span>
							</span>
						) : (
							loading && <DescriptionGhost width="w-56" />
						)}
					</Swap>
				}
				actions={
					canWrite && (
						<Swap id={volume ? "actions" : loading ? "pending" : "none"}>
							{volume ? (
								<div className="flex flex-wrap items-center gap-2">
									<VolumeActions volume={volume} />
								</div>
							) : (
								loading && (
									<div className="flex items-center gap-2">
										<SkeletonBlock className="h-8 w-36" />
										<SkeletonBlock className="h-8 w-36" />
									</div>
								)
							)}
						</Swap>
					)
				}
			/>
			<Loaded query={inventory} skeleton={<VolumeSkeleton canWrite={canWrite} />}>
				{(inv) => (
					<Swap id={volume ? "volume" : "missing"}>
						{volume ? (
							<VolumeDetail volume={volume} inventory={inv} canWrite={canWrite} />
						) : (
							<VolumeMissing id={volumeId} inventory={inv} />
						)}
					</Swap>
				)}
			</Loaded>
		</>
	);
}

function VolumeMissing({ id, inventory }: { id: string; inventory: StorageInventory }) {
	const ec = inventory.ecVolumes.find((v) => v.id === Number(id));
	return (
		<EmptyState
			icon={<HardDrive />}
			title={ec ? `Volume ${id} is erasure coded` : `Volume ${id} is not in the cluster`}
			description={
				ec
					? "Its data now lives in shards spread across servers."
					: "It may have been deleted, or its server stopped reporting."
			}
			action={
				ec ? (
					<Button
						size="sm"
						variant="outline"
						render={<Link to="/erasure-coding/$volumeId" params={{ volumeId: String(ec.id) }} />}
					>
						View its shards
					</Button>
				) : (
					<Button size="sm" variant="outline" render={<Link to="/volumes" />}>
						<ArrowLeft />
						All volumes
					</Button>
				)
			}
		/>
	);
}

function VolumeDetail({
	volume,
	inventory,
	canWrite,
}: {
	volume: StorageVolume;
	inventory: StorageInventory;
	canWrite: boolean;
}) {
	const rank = fleetRank(volume, inventory);
	return (
		<>
			<StatBand
				stats={[
					{ label: "Files", value: volume.fileCount, hint: `${formatCount(volume.deleteCount)} deleted` },
					{
						label: "Reclaimable",
						value: volume.deletedBytes,
						format: formatBytes,
						hint: `${formatPercent(volume.garbageRatio)} garbage`,
					},
					{ label: "Copies", value: volume.replicas.length, hint: `${volume.expectedReplicas} expected` },
					{ label: "Compactions", value: volume.replicas[0]?.compactRevision ?? 0, hint: "Vacuums so far" },
				]}
			/>
			<div className="mt-8 grid items-start gap-x-6 gap-y-8 lg:grid-cols-12">
				<Section title="Fill" className="mt-0 min-w-0 lg:col-span-8">
					<FeatureSheet className="p-4">
						<SheetCaption
							title={
								<span className="metric text-[20px]">
									<RollingValue text={formatBytes(volume.size)} />
								</span>
							}
						>
							<TextMorph>
								{`${formatPercent(volume.fullness)} of the ${formatBytes(inventory.volumeSizeLimitBytes)} limit`}
							</TextMorph>
						</SheetCaption>
						<div className="mt-3">
							<FillGauge
								size={volume.size}
								deleted={volume.deletedBytes}
								limit={inventory.volumeSizeLimitBytes}
							/>
						</div>
					</FeatureSheet>
					{volume.replicas.length > 1 && (
						<FeatureSheet className="mt-3 p-4">
							<SheetCaption title="Copies compared">
								Copies that drift apart are still catching up
							</SheetCaption>
							<BarList
								className="mt-3"
								label="Size of each copy"
								color={dataColor(0)}
								items={volume.replicas.map((r) => ({
									key: `${r.server}-${r.diskId}`,
									label: <span className="font-mono">{r.server}</span>,
									value: r.size,
									display: formatBytes(r.size),
								}))}
							/>
						</FeatureSheet>
					)}
				</Section>
				<Section title="Details" className="mt-0 lg:col-span-4">
					<InfoList
						items={[
							{ label: "Replication", value: <span className="font-mono">{volume.replication}</span> },
							{ label: "Time to live", value: volume.ttl || "Keep forever" },
							{ label: "Disk type", value: volume.diskType },
							{ label: "Format", value: `Version ${volume.version}` },
							{ label: "Last write", value: formatDateTime(volume.modifiedAt) },
							{
								label: "Remote tier",
								value: volume.replicas.find((r) => r.remoteStorage)?.remoteStorage || "None",
							},
						]}
					/>
					<p className="mt-2 px-4 text-[12px] text-muted-foreground">
						{describeReplication(volume.replication)}
					</p>
					<h3 className="mt-6 mb-2 font-semibold text-[13px]">In the fleet</h3>
					<InfoList
						items={[
							{
								label: "Size rank",
								value: <TextMorph>{`#${rank.rank} of ${formatCount(rank.of)}`}</TextMorph>,
							},
							{
								label: "Share of its collection",
								value: `${formatPercent(rank.shareOfCollection)} of ${formatCount(rank.peers)} ${rank.peers === 1 ? "volume" : "volumes"}`,
							},
							{
								label: "Garbage",
								value: `${formatPercent(volume.garbageRatio)} (collection ${formatPercent(rank.peerGarbage)})`,
							},
						]}
					/>
				</Section>
			</div>
			<Section
				title="Copies"
				description="Each server holding this volume. Turn off writes on a copy to freeze it."
			>
				<DataTable
					data={volume.replicas}
					columns={replicaColumns(volume, canWrite)}
					getRowId={(r) => `${r.server}-${r.diskId}`}
					empty={null}
				/>
			</Section>
		</>
	);
}

const NO_VOLUME = {} as StorageVolume;

function VolumeSkeleton({ canWrite }: { canWrite: boolean }) {
	return (
		<LoadingRegion label="Loading">
			{/* The tile with both a unit and a hint stands a little taller. */}
			<StatsGhost className="[&>:nth-child(-n+2)]:pb-[18px]" />
			<div className="mt-8 grid items-start gap-x-6 gap-y-8 lg:grid-cols-12">
				<Section title="Fill" className="mt-0 min-w-0 lg:col-span-8">
					<FeatureSheet className="p-4">
						<div className="flex h-[30px] items-center justify-between gap-4">
							<SkeletonBlock className="h-6 w-24" />
							<SkeletonBlock className="h-3 w-36" />
						</div>
						<SkeletonBlock className="mt-3 h-2 w-full rounded-full" />
						<div className="mt-3 grid grid-cols-3 gap-4">
							{[0, 1, 2].map((i) => (
								<div key={i}>
									<SkeletonBlock className="my-0.5 h-3 w-20" />
									<SkeletonBlock className="mt-[7px] h-3.5 w-16" />
								</div>
							))}
						</div>
					</FeatureSheet>
				</Section>
				<Section title="Details" className="mt-0 lg:col-span-4">
					<InfoList
						items={["Replication", "Time to live", "Disk type", "Format", "Last write", "Remote tier"].map(
							(label) => ({ label, value: <ValueGhost /> }),
						)}
					/>
					<div className="mt-2 flex h-5 items-center px-4">
						<SkeletonBlock className="h-3 w-4/5" />
					</div>
					<h3 className="mt-6 mb-2 font-semibold text-[13px]">In the fleet</h3>
					<InfoList
						items={["Size rank", "Share of its collection", "Garbage"].map((label) => ({
							label,
							value: <ValueGhost />,
						}))}
					/>
				</Section>
			</div>
			<Section
				title="Copies"
				description="Each server holding this volume. Turn off writes on a copy to freeze it."
			>
				<Frozen>
					<DataTable
						data={undefined}
						isLoading
						columns={ghostCells(replicaColumns(NO_VOLUME, canWrite), 34)}
						getRowId={(r) => r.server}
						empty={null}
					/>
				</Frozen>
			</Section>
		</LoadingRegion>
	);
}
