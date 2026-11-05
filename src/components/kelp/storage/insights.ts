/**
 * Numbers and shapes the storage pages chart, derived from the inventory and live telemetry. Pure
 * functions, so every chart's data is tested without rendering it.
 */
import type { EcVolume, StorageCollection, StorageInventory, StorageVolume } from "@shared/storage.ts";
import type { TelemetryPoint } from "@shared/telemetry.ts";
import type { BarListItem, Column, RingSlice, TimeSeries } from "@/components/kelp/charts/index.ts";
import { dataColor } from "@/components/kelp/charts/index.ts";
import { formatBytes, formatCount, formatPercent, ratio } from "@/lib/format.ts";
import { collectionLabel } from "@/lib/storage-queries.ts";

/** Volumes grouped by how full they are, in ten 10% steps. */
export function fillColumns(volumes: StorageVolume[]): Column[] {
	const counts = Array.from({ length: 10 }, () => 0);
	for (const volume of volumes) {
		const step = Math.min(9, Math.max(0, Math.floor(volume.fullness * 10)));
		counts[step] = (counts[step] as number) + 1;
	}
	return counts.map((value, i) => ({ label: `${i * 10}%`, value }));
}

const HOUR = 3_600_000;
const AGES: Array<[string, number]> = [
	["1 hour", HOUR],
	["1 day", 24 * HOUR],
	["1 week", 7 * 24 * HOUR],
	["30 days", 30 * 24 * HOUR],
];

/**
 * Volumes by how recently they were written: hot ones still take data, cold ones only serve reads
 * and are the ones erasure coding and tiering are for.
 */
export function lastWriteColumns(volumes: StorageVolume[], now = Date.now()): Column[] {
	const columns = [
		...AGES.map(([label]) => ({ label: `< ${label}`, value: 0 })),
		{ label: "Older", value: 0 },
	];
	for (const volume of volumes) {
		const at = volume.modifiedAt ? Date.parse(volume.modifiedAt) : Number.NaN;
		const age = Number.isNaN(at) ? Number.POSITIVE_INFINITY : now - at;
		const index = AGES.findIndex(([, limit]) => age < limit);
		const column = columns[index === -1 ? AGES.length : index] as Column;
		column.value++;
	}
	return columns;
}

/** Volumes written in the last day: the ones still taking data. */
export function hotVolumes(volumes: StorageVolume[], now = Date.now()): number {
	return volumes.filter((v) => v.modifiedAt && now - Date.parse(v.modifiedAt) < 24 * HOUR).length;
}

/** Stored bytes by collection as ring slices: the four largest by name, the rest as "Other". */
export function collectionSlices(collections: StorageCollection[]): RingSlice[] {
	const ranked = [...collections].filter((c) => c.size > 0).sort((a, b) => b.size - a.size);
	const slices: RingSlice[] = ranked.slice(0, 4).map((c, i) => ({
		label: collectionLabel(c.name),
		value: c.size,
		color: dataColor(i),
		display: formatBytes(c.size),
	}));
	const rest = ranked.slice(4).reduce((sum, c) => sum + c.size, 0);
	if (rest > 0) slices.push({ label: "Other", value: rest, color: dataColor(4), display: formatBytes(rest) });
	return slices;
}

/** Collections ranked by one measure, largest first. */
export function collectionBars(
	collections: StorageCollection[],
	measure: (c: StorageCollection) => number,
	display: (value: number) => string,
	limit = 6,
): BarListItem[] {
	return [...collections]
		.map((c) => ({ c, value: measure(c) }))
		.filter((entry) => entry.value > 0)
		.sort((a, b) => b.value - a.value)
		.slice(0, limit)
		.map(({ c, value }) => ({
			key: c.name || "(default)",
			label: collectionLabel(c.name),
			value,
			display: display(value),
		}));
}

/** Average object size in a collection: what kind of data lives there. */
export function averageObject(c: StorageCollection): number {
	return c.fileCount > 0 ? c.size / c.fileCount : 0;
}

/** The volumes with the most reclaimable bytes, where a vacuum pays off first. */
export function garbageBars(volumes: StorageVolume[], limit = 6): Array<BarListItem & { id: number }> {
	return [...volumes]
		.filter((v) => v.deletedBytes > 0)
		.sort((a, b) => b.deletedBytes - a.deletedBytes)
		.slice(0, limit)
		.map((v) => ({
			id: v.id,
			key: String(v.id),
			label: `Volume ${v.id}`,
			value: v.deletedBytes,
			display: `${formatBytes(v.deletedBytes)} · ${formatPercent(v.garbageRatio)}`,
		}));
}

/** Volumes by replication setting, e.g. "000" × 40, "010" × 12. */
export function replicationBars(volumes: StorageVolume[]): BarListItem[] {
	const counts = new Map<string, number>();
	for (const v of volumes) counts.set(v.replication, (counts.get(v.replication) ?? 0) + 1);
	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1])
		.map(([replication, count]) => ({
			key: replication,
			label: replication,
			value: count,
			display: formatCount(count),
		}));
}

/** Reads and writes per second on the volume servers, from the sampled metrics. */
export function volumeTraffic(points: TelemetryPoint[]): TimeSeries[] {
	return [
		{ label: "Reads", color: dataColor(0), values: points.map((p) => reads(p)) },
		{ label: "Writes", color: dataColor(1), values: points.map((p) => writes(p)) },
	];
}

export function reads(point: TelemetryPoint): number {
	return (point.volume.byType.GET ?? 0) + (point.volume.byType.HEAD ?? 0);
}

export function writes(point: TelemetryPoint): number {
	return (point.volume.byType.POST ?? 0) + (point.volume.byType.PUT ?? 0) + (point.volume.byType.DELETE ?? 0);
}

/** Where a volume stands in the fleet: its size rank and how its garbage compares. */
export function fleetRank(volume: StorageVolume, inventory: StorageInventory) {
	const bySize = [...inventory.volumes].sort((a, b) => b.size - a.size);
	const peers = inventory.volumes.filter((v) => v.collection === volume.collection);
	const collectionBytes = peers.reduce((sum, v) => sum + v.size, 0);
	const peerGarbage = ratio(
		peers.reduce((sum, v) => sum + v.deletedBytes, 0),
		collectionBytes,
	);
	return {
		rank: bySize.findIndex((v) => v.id === volume.id) + 1,
		of: inventory.volumes.length,
		shareOfCollection: ratio(volume.size, collectionBytes),
		peers: peers.length,
		peerGarbage,
	};
}

/** EC shards held by each server, busiest first. */
export function shardsPerServer(ecVolumes: EcVolume[]): Column[] {
	const counts = new Map<string, number>();
	for (const ec of ecVolumes) {
		for (const placement of ec.placements) {
			counts.set(placement.server, (counts.get(placement.server) ?? 0) + placement.shards.length);
		}
	}
	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([server, value]) => ({ label: server, value }));
}

/**
 * What erasure coding saves: the logical data in EC volumes, and the bytes two full copies of it
 * would take compared with the shards actually stored.
 */
export function ecSavings(ecVolumes: EcVolume[]) {
	const stored = ecVolumes.reduce((sum, ec) => sum + ec.size, 0);
	const data = ecVolumes.reduce((sum, ec) => sum + ec.size * ratio(ec.dataShards, ec.totalShards), 0);
	return { stored, data, saved: Math.max(0, data * 2 - stored) };
}

/** Bytes kept as plain replicated volumes against bytes kept as EC shards. */
export function protectionSlices(inventory: StorageInventory): RingSlice[] {
	const replicated = inventory.volumes.reduce((sum, v) => sum + v.size * Math.max(1, v.replicas.length), 0);
	const ec = inventory.ecVolumes.reduce((sum, v) => sum + v.size, 0);
	return [
		{ label: "Replicated volumes", value: replicated, color: dataColor(0), display: formatBytes(replicated) },
		{ label: "Erasure-coded shards", value: ec, color: dataColor(3), display: formatBytes(ec) },
	];
}

/** Volumes held by each server, for a collection or the whole fleet. */
export function volumesPerServer(volumes: StorageVolume[]): BarListItem[] {
	const counts = new Map<string, number>();
	for (const v of volumes) for (const r of v.replicas) counts.set(r.server, (counts.get(r.server) ?? 0) + 1);
	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([server, count]) => ({ key: server, label: server, value: count, display: formatCount(count) }));
}
