import type { StorageVolume, VolumeReplica } from "@shared/storage.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Eraser, HardDrive, Lock, LockOpen } from "lucide-react";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import {
	AuroraCard,
	EmptyState,
	ErrorState,
	InfoList,
	PageHeader,
	Reveal,
	Section,
	StatBand,
	StatusDot,
} from "@/components/kelp/page.tsx";
import { describeReplication } from "@/components/kelp/storage/cluster-actions.tsx";
import { PageSkeleton, SheetCaption } from "@/components/kelp/storage/common.tsx";
import { FillGauge } from "@/components/kelp/storage/visuals.tsx";
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
			<Button variant="secondary" disabled={vacuum.isPending} onClick={() => vacuum.mutate([volume])}>
				<Eraser />
				Vacuum volume
			</Button>
			<Button
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
	if (!data) return <PageSkeleton />;

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
								className="text-primary hover:underline"
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
			</Reveal>
			<div className="mt-8 grid items-start gap-x-6 gap-y-8 lg:grid-cols-12">
				<Section title="Fill" className="mt-0 min-w-0 lg:col-span-8">
					<AuroraCard className="p-4">
						<SheetCaption title={<span className="metric text-[20px]">{formatBytes(volume.size)}</span>}>
							{formatPercent(volume.fullness)} of the {formatBytes(data.volumeSizeLimitBytes)} limit
						</SheetCaption>
						<div className="mt-3">
							<FillGauge size={volume.size} deleted={volume.deletedBytes} limit={data.volumeSizeLimitBytes} />
						</div>
					</AuroraCard>
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
