import type { EcVolume } from "@shared/storage.ts";
import { Link, useNavigate } from "@tanstack/react-router";
import { Blocks } from "lucide-react";
import { useMemo } from "react";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import { EmptyState, StatusDot } from "@/components/kelp/page.tsx";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatCount } from "@/lib/format.ts";
import { collectionLabel, serverPalette } from "@/lib/storage-queries.ts";
import { ServerLegend, ShardMap } from "./shard-map.tsx";

export function ecHealth(ec: EcVolume): { tone: "good" | "warn" | "bad"; label: string } {
	if (ec.missingShards.length > ec.parityShards && ec.parityShards > 0) {
		return { tone: "bad", label: "Unreadable" };
	}
	if (ec.missingShards.length > 0) {
		return { tone: "bad", label: `${ec.missingShards.length} missing` };
	}
	if (ec.duplicateShards.length > 0) return { tone: "warn", label: "Extra copies" };
	return { tone: "good", label: "Complete" };
}

/** Shard counts per server across a set of EC volumes, for the legend. */
export function shardCounts(ecVolumes: EcVolume[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const ec of ecVolumes) {
		for (const p of ec.placements) counts.set(p.server, (counts.get(p.server) ?? 0) + p.shards.length);
	}
	return counts;
}

export function EcVolumeList({
	ecVolumes,
	isLoading,
	error,
	onRetry,
	showCollection = true,
}: {
	ecVolumes: EcVolume[] | undefined;
	isLoading?: boolean;
	error?: unknown;
	onRetry?: () => void;
	showCollection?: boolean;
}) {
	const navigate = useNavigate();
	const counts = useMemo(() => shardCounts(ecVolumes ?? []), [ecVolumes]);
	const palette = useMemo(() => serverPalette([...counts.keys()]), [counts]);
	const columns = useMemo(() => {
		const all: Array<Column<EcVolume> | false> = [
			{
				accessorKey: "id",
				header: "Volume",
				cell: ({ row }) => (
					<Link
						to="/erasure-coding/$volumeId"
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
						<Badge variant="secondary">{row.original.collection}</Badge>
					) : (
						<span className="text-muted-foreground">{collectionLabel("")}</span>
					),
			},
			{
				id: "shards",
				header: "Shards",
				cell: ({ row }) => <ShardMap ec={row.original} palette={palette} />,
				enableSorting: false,
				size: 280,
			},
			{
				id: "health",
				accessorFn: (ec) => ec.missingShards.length,
				header: "Health",
				cell: ({ row }) => {
					const health = ecHealth(row.original);
					return <StatusDot tone={health.tone} label={health.label} />;
				},
			},
			{
				accessorKey: "size",
				header: "Size",
				cell: ({ row }) => <span className="tabular">{formatBytes(row.original.size)}</span>,
			},
			{
				accessorKey: "fileCount",
				header: "Files",
				cell: ({ row }) => <span className="tabular">{formatCount(row.original.fileCount)}</span>,
			},
		];
		return all.filter((c): c is Column<EcVolume> => Boolean(c));
	}, [palette, showCollection]);

	return (
		<div className="space-y-4">
			{counts.size > 0 && (
				<ServerLegend
					palette={palette}
					counts={counts}
					showMissing={(ecVolumes ?? []).some((ec) => ec.missingShards.length > 0)}
				/>
			)}
			<DataTable
				data={ecVolumes}
				columns={columns}
				getRowId={(ec) => String(ec.id)}
				isLoading={isLoading}
				error={error}
				{...(onRetry ? { onRetry } : {})}
				searchText={(ec) => `${ec.id} ${ec.collection} ${ec.placements.map((p) => p.server).join(" ")}`}
				searchPlaceholder="Search EC volumes"
				initialSorting={[{ id: "id", desc: false }]}
				onRowClick={(ec) =>
					navigate({ to: "/erasure-coding/$volumeId", params: { volumeId: String(ec.id) } })
				}
				empty={
					<EmptyState
						icon={<Blocks />}
						title="No erasure-coded volumes"
						description="Erasure coding turns full, quiet volumes into shards that take 1.4× their size instead of a full copy per replica. The maintenance worker encodes volumes once it is enabled."
					/>
				}
			/>
		</div>
	);
}
