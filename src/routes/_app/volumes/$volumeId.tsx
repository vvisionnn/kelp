import type { StorageVolume, VolumeReplica } from "@shared/storage.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Eraser, HardDrive, Lock, LockOpen } from "lucide-react";
import type { ReactNode } from "react";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import {
	AuroraCard,
	EmptyState,
	ErrorState,
	Metric,
	PageHeader,
	Reveal,
	StatusDot,
} from "@/components/kelp/page.tsx";
import { describeReplication } from "@/components/kelp/storage/cluster-actions.tsx";
import { Facts, PageSkeleton, SectionTitle } from "@/components/kelp/storage/common.tsx";
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
								className="font-medium text-foreground underline decoration-foreground/20 underline-offset-4 hover:decoration-foreground"
							>
								{collectionLabel(volume.collection)}
							</Link>{" "}
							collection
						</span>
					</span>
				}
				actions={canWrite && <VolumeActions volume={volume} />}
			/>
			<Reveal className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
				<AuroraCard className="p-7 sm:p-9">
					<div className="flex items-center justify-between text-[13px] text-foreground/70">
						<span>Fill</span>
						<span>
							{formatPercent(volume.fullness)} of {formatBytes(data.volumeSizeLimitBytes)}
						</span>
					</div>
					<p className="mt-10 font-[450] text-6xl leading-none tracking-[-0.045em]">
						{formatBytes(volume.size)}
					</p>
					<div className="mt-8">
						<FillGauge size={volume.size} deleted={volume.deletedBytes} limit={data.volumeSizeLimitBytes} />
					</div>
				</AuroraCard>
				<dl className="grid grid-cols-2 content-between gap-x-6 gap-y-8 rounded-2xl bg-card p-7 sm:p-9">
					<Figure
						label="Files"
						value={<Metric value={volume.fileCount} />}
						hint={`${formatCount(volume.deleteCount)} deleted`}
					/>
					<Figure
						label="Reclaimable"
						value={formatBytes(volume.deletedBytes)}
						hint={`${formatPercent(volume.garbageRatio)} garbage`}
					/>
					<Figure
						label="Copies"
						value={<Metric value={volume.replicas.length} />}
						hint={`${volume.expectedReplicas} expected`}
					/>
					<Figure
						label="Compactions"
						value={<Metric value={volume.replicas[0]?.compactRevision ?? 0} />}
						hint="Vacuums so far"
					/>
				</dl>
			</Reveal>
			<div className="mt-10">
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
			</div>
			<section className="mt-16">
				<SectionTitle
					title="Copies"
					description="Each server holding this volume. Turn off writes on a copy to freeze it."
				/>
				<DataTable
					data={volume.replicas}
					columns={replicaColumns(volume, canWrite)}
					getRowId={(r) => `${r.server}-${r.diskId}`}
					empty={null}
				/>
			</section>
		</>
	);
}

/** A number in the facts card: label, big value, a line of context. */
function Figure({ label, value, hint }: { label: string; value: ReactNode; hint: string }) {
	return (
		<div className="flex flex-col-reverse justify-end gap-2">
			<dt className="text-[13px] text-muted-foreground">
				{label}
				<span className="block text-foreground/40">{hint}</span>
			</dt>
			<dd className="font-[450] text-[32px] leading-none tracking-[-0.03em]">{value}</dd>
		</div>
	);
}
