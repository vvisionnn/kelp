import type { StorageVolume, VolumeReplica } from "@shared/storage.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowLeft,
	Copy as CopyIcon,
	Eraser,
	FileStack,
	HardDrive,
	Lock,
	LockOpen,
	Trash2,
} from "lucide-react";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import {
	CapacityBar,
	EmptyState,
	ErrorState,
	PageHeader,
	Panel,
	Reveal,
	SkeletonBlock,
	StatTile,
	StatusDot,
} from "@/components/kelp/page.tsx";
import { describeReplication } from "@/components/kelp/storage/cluster-actions.tsx";
import { Facts, Tiles, TilesSkeleton } from "@/components/kelp/storage/common.tsx";
import { useVolumeActions } from "@/components/kelp/storage/volume-actions.ts";
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
						<span className="text-muted-foreground"> · {formatCount(row.original.deleteCount)} deleted</span>
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
			<Button size="sm" variant="outline" disabled={vacuum.isPending} onClick={() => vacuum.mutate([volume])}>
				<Eraser />
				Vacuum volume
			</Button>
			<Button
				size="sm"
				variant="outline"
				disabled={setReadOnly.isPending}
				onClick={() => setReadOnly.mutate({ volumes: [volume], readOnly: !volume.readOnly })}
			>
				{volume.readOnly ? <LockOpen /> : <Lock />}
				{volume.readOnly ? "Make writable" : "Make read-only"}
			</Button>
		</>
	);
}

function VolumePage() {
	const { volumeId } = Route.useParams();
	const id = Number(volumeId);
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

	const volume = data.volumes.find((v) => v.id === id);
	if (!volume) {
		const ec = data.ecVolumes.find((v) => v.id === id);
		return (
			<EmptyState
				icon={<HardDrive />}
				title={ec ? `Volume ${volumeId} is erasure coded` : `Volume ${volumeId} is not in the cluster`}
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

	const health = volumeHealth(volume);
	return (
		<>
			<PageHeader
				title={`Volume ${volume.id}`}
				description={
					<span className="flex flex-wrap items-center gap-x-3 gap-y-1">
						<StatusDot tone={health.tone} label={health.label} />
						<span>
							In{" "}
							<Link
								to="/collections/$name"
								params={{ name: collectionParam(volume.collection) }}
								className="font-medium text-foreground hover:underline"
							>
								{collectionLabel(volume.collection)}
							</Link>{" "}
							collection
						</span>
					</span>
				}
				actions={canWrite && <VolumeActions volume={volume} />}
			/>
			<Reveal>
				<Tiles>
					<div className="rounded-xl border bg-card px-5 py-4">
						<p className="text-muted-foreground text-sm">Size</p>
						<p className="mt-2 font-semibold text-2xl tracking-tight [font-stretch:90%]">
							{formatBytes(volume.size)}
						</p>
						<CapacityBar used={volume.size} total={data.volumeSizeLimitBytes} className="mt-2" />
						<p className="mt-1 text-muted-foreground text-xs">
							{formatPercent(volume.fullness)} of {formatBytes(data.volumeSizeLimitBytes)}
						</p>
					</div>
					<StatTile
						label="Files"
						value={volume.fileCount}
						icon={<FileStack />}
						hint={`${formatCount(volume.deleteCount)} deleted`}
					/>
					<StatTile
						label="Reclaimable"
						value={volume.deletedBytes}
						format={formatBytes}
						icon={<Trash2 />}
						hint={`${formatPercent(volume.garbageRatio)} garbage`}
					/>
					<StatTile
						label="Copies"
						value={volume.replicas.length}
						icon={<CopyIcon />}
						hint={`${volume.expectedReplicas} expected`}
					/>
				</Tiles>
			</Reveal>
			<div className="mt-6 space-y-6">
				<Panel>
					<Facts
						items={[
							[
								"Replication",
								<span key="r" title={describeReplication(volume.replication)}>
									<span className="font-mono">{volume.replication}</span>
									<span className="block text-muted-foreground text-xs">
										{describeReplication(volume.replication)}
									</span>
								</span>,
							],
							["Time to live", volume.ttl || "Keep forever"],
							["Disk type", volume.diskType],
							["Format", `Version ${volume.version}`],
							["Last write", formatDateTime(volume.modifiedAt)],
							["Remote tier", volume.replicas.find((r) => r.remoteStorage)?.remoteStorage || "None"],
						]}
					/>
				</Panel>
				<Panel
					title="Copies"
					description="Each server holding this volume. Turn off writes on a copy to freeze it."
				>
					<DataTable
						data={volume.replicas}
						columns={replicaColumns(volume, canWrite)}
						getRowId={(r) => `${r.server}-${r.diskId}`}
						empty={null}
					/>
				</Panel>
			</div>
		</>
	);
}
