import type { StorageVolume } from "@shared/storage.ts";
import { Link, useNavigate } from "@tanstack/react-router";
import { Eraser, HardDrive, Lock, LockOpen, MoreHorizontal } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Segmented } from "@/components/kelp/controls.tsx";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import { EmptyState, StatusDot } from "@/components/kelp/page.tsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatBytes, formatCount, formatPercent, formatRelative } from "@/lib/format.ts";
import { useCanWrite } from "@/lib/session.ts";
import { collectionLabel, VACUUM_THRESHOLD, volumeHealth } from "@/lib/storage-queries.ts";
import { cn } from "@/lib/utils";
import { useVolumeActions } from "./volume-actions.ts";

export type VolumeFilter = "all" | "attention" | "read-only" | "vacuum";

const FILTERS: Array<{ value: VolumeFilter; label: string }> = [
	{ value: "all", label: "All" },
	{ value: "attention", label: "Needs attention" },
	{ value: "vacuum", label: "Needs vacuum" },
	{ value: "read-only", label: "Read-only" },
];

export function matchesFilter(volume: StorageVolume, filter: VolumeFilter): boolean {
	switch (filter) {
		case "attention":
			return volumeHealth(volume).tone !== "good";
		case "vacuum":
			return volume.garbageRatio >= VACUUM_THRESHOLD;
		case "read-only":
			return volume.readOnly;
		default:
			return true;
	}
}

/** Thin fill bar for a volume's size against the cluster volume size limit. */
function FillBar({ fullness }: { fullness: number }) {
	const width = Math.min(1, fullness) * 100;
	return (
		<span
			className="mt-1.5 block h-1 w-24 overflow-hidden rounded-full bg-foreground/[0.08]"
			aria-hidden="true"
		>
			<span
				className={cn("block h-full rounded-full", fullness >= 0.95 ? "bg-warning" : "bg-area")}
				style={{ width: `${width}%` }}
			/>
		</span>
	);
}

function VolumeMenu({ volume }: { volume: StorageVolume }) {
	const { vacuum, setReadOnly } = useVolumeActions();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={`Actions for volume ${volume.id}`}
						onClick={(event) => event.stopPropagation()}
					/>
				}
			>
				<MoreHorizontal />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48" onClick={(event) => event.stopPropagation()}>
				<DropdownMenuItem onClick={() => vacuum.mutate([volume])}>
					<Eraser />
					Vacuum volume
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				{volume.readOnly ? (
					<DropdownMenuItem onClick={() => setReadOnly.mutate({ volumes: [volume], readOnly: false })}>
						<LockOpen />
						Make writable
					</DropdownMenuItem>
				) : (
					<DropdownMenuItem onClick={() => setReadOnly.mutate({ volumes: [volume], readOnly: true })}>
						<Lock />
						Make read-only
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function volumeColumns({
	showCollection = true,
	canWrite = false,
}: {
	showCollection?: boolean;
	canWrite?: boolean;
} = {}): Array<Column<StorageVolume>> {
	const columns: Array<Column<StorageVolume> | false> = [
		{
			accessorKey: "id",
			header: "Volume",
			cell: ({ row }) => (
				<Link
					to="/volumes/$volumeId"
					params={{ volumeId: String(row.original.id) }}
					className="font-medium font-mono hover:underline"
					onClick={(event) => event.stopPropagation()}
				>
					{row.original.id}
				</Link>
			),
			size: 90,
		},
		showCollection && {
			accessorKey: "collection",
			header: "Collection",
			cell: ({ row }) =>
				row.original.collection ? (
					<Badge variant="area">{row.original.collection}</Badge>
				) : (
					<span className="text-muted-foreground">{collectionLabel("")}</span>
				),
		},
		{
			accessorKey: "size",
			header: "Size",
			cell: ({ row }) => (
				<div>
					<span className="tabular">{formatBytes(row.original.size)}</span>
					<FillBar fullness={row.original.fullness} />
				</div>
			),
		},
		{
			accessorKey: "fileCount",
			header: "Files",
			cell: ({ row }) => <span className="tabular">{formatCount(row.original.fileCount)}</span>,
		},
		{
			accessorKey: "garbageRatio",
			header: "Garbage",
			cell: ({ row }) => (
				<span
					className={cn(
						"tabular",
						row.original.garbageRatio >= VACUUM_THRESHOLD
							? "font-medium text-warning-foreground"
							: "text-muted-foreground",
					)}
				>
					{row.original.deletedBytes > 0 ? formatPercent(row.original.garbageRatio) : "None"}
				</span>
			),
		},
		{
			id: "copies",
			accessorFn: (v) => v.replicas.length,
			header: "Copies",
			cell: ({ row }) => (
				<span className="tabular">
					{row.original.replicas.length}
					<span className="text-muted-foreground"> of {row.original.expectedReplicas}</span>
				</span>
			),
		},
		{
			id: "status",
			accessorFn: (v) => volumeHealth(v).label,
			header: "Status",
			cell: ({ row }) => {
				const health = volumeHealth(row.original);
				return <StatusDot tone={health.tone} label={health.label} />;
			},
		},
		{
			accessorKey: "modifiedAt",
			header: "Last write",
			cell: ({ row }) => (
				<span className="text-muted-foreground text-xs">{formatRelative(row.original.modifiedAt)}</span>
			),
		},
		canWrite && {
			id: "actions",
			header: () => <span className="sr-only">Actions</span>,
			cell: ({ row }) => <VolumeMenu volume={row.original} />,
			size: 48,
			enableSorting: false,
		},
	];
	return columns.filter((c): c is Column<StorageVolume> => Boolean(c));
}

export interface VolumeTableProps {
	volumes: StorageVolume[] | undefined;
	isLoading?: boolean;
	error?: unknown;
	onRetry?: () => void;
	showCollection?: boolean;
	empty?: ReactNode;
	toolbar?: ReactNode;
	initialFilter?: VolumeFilter;
}

/** Volumes with search, health filters, per-row actions and bulk vacuum / read-only. */
export function VolumeTable({
	volumes,
	isLoading,
	error,
	onRetry,
	showCollection = true,
	empty,
	toolbar,
	initialFilter = "all",
}: VolumeTableProps) {
	const canWrite = useCanWrite();
	const navigate = useNavigate();
	const [filter, setFilter] = useState<VolumeFilter>(initialFilter);
	const { vacuum, setReadOnly } = useVolumeActions();
	const columns = useMemo(() => volumeColumns({ showCollection, canWrite }), [showCollection, canWrite]);
	const rows = useMemo(() => volumes?.filter((v) => matchesFilter(v, filter)), [volumes, filter]);

	return (
		<DataTable
			data={rows}
			columns={columns}
			getRowId={(v) => String(v.id)}
			isLoading={isLoading}
			error={error}
			{...(onRetry ? { onRetry } : {})}
			searchText={(v) =>
				`${v.id} ${v.collection} ${v.replication} ${v.replicas.map((r) => r.server).join(" ")}`
			}
			searchPlaceholder="Search volumes"
			initialSorting={[{ id: "id", desc: false }]}
			onRowClick={(v) => navigate({ to: "/volumes/$volumeId", params: { volumeId: String(v.id) } })}
			toolbar={
				<>
					<div className="max-w-[calc(100vw-2rem)] overflow-x-auto lg:max-w-none">
						<Segmented
							label="Filter volumes"
							items={FILTERS}
							value={filter}
							onChange={setFilter}
							className="w-max"
						/>
					</div>
					{toolbar}
				</>
			}
			empty={
				filter === "all" ? (
					(empty ?? (
						<EmptyState
							icon={<HardDrive />}
							title="No volumes yet"
							description="SeaweedFS creates volumes as data arrives. You can also grow some ahead of time."
						/>
					))
				) : (
					<EmptyState
						icon={<HardDrive />}
						title="Nothing to show"
						description={`No volume matches "${FILTERS.find((f) => f.value === filter)?.label}".`}
					/>
				)
			}
			{...(canWrite
				? {
						bulkActions: (selected: StorageVolume[], clear: () => void) => (
							<>
								<Button
									size="sm"
									variant="outline"
									onClick={() => vacuum.mutate(selected, { onSuccess: clear })}
									disabled={vacuum.isPending}
								>
									<Eraser />
									Vacuum
								</Button>
								<Button
									size="sm"
									variant="outline"
									onClick={() =>
										setReadOnly.mutate({ volumes: selected, readOnly: true }, { onSuccess: clear })
									}
									disabled={setReadOnly.isPending}
								>
									<Lock />
									Make read-only
								</Button>
								<Button
									size="sm"
									variant="outline"
									onClick={() =>
										setReadOnly.mutate({ volumes: selected, readOnly: false }, { onSuccess: clear })
									}
									disabled={setReadOnly.isPending}
								>
									<LockOpen />
									Make writable
								</Button>
							</>
						),
					}
				: {})}
		/>
	);
}
