import type {
	EcPlacement,
	EcVolume,
	StorageCollection,
	StorageDisk,
	StorageInventory,
	StorageVolume,
	VolumeReplica,
} from "../../shared/storage.ts";
import { list, num, obj, type Raw, str, time } from "./raw.ts";

const MB = 1024 * 1024;
/** SeaweedFS's default erasure coding: 10 data shards + 4 parity shards. */
const DEFAULT_DATA_SHARDS = 10;
const DEFAULT_PARITY_SHARDS = 4;

/** Copies implied by a replication setting like "010": 1 + each digit. */
export function copiesFor(replication: string): number {
	if (!/^\d{3}$/.test(replication)) return 1;
	return 1 + [...replication].reduce((sum, digit) => sum + Number(digit), 0);
}

function epochToIso(seconds: number): string | null {
	return seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}

/** An empty disk type means the default hard-disk tier. */
function diskTypeOf(...candidates: unknown[]): string {
	for (const candidate of candidates) {
		const value = str(candidate);
		if (value) return value;
	}
	return "hdd";
}

const unique = <T>(values: T[]) => [...new Set(values)];
const sortedStrings = (values: string[]) => unique(values).sort((a, b) => a.localeCompare(b));

/** Maps the admin's `/api/volumes/export` document into Kelp's storage inventory. */
export function mapInventory(raw: unknown): StorageInventory {
	const doc = obj(raw);
	const limitMb = num(doc.volume_size_limit_mb) || 30_000;
	const volumeSizeLimitBytes = limitMb * MB;

	const replicasById = new Map<number, { base: Raw; replicas: VolumeReplica[] }>();
	const shardsById = new Map<number, { base: Raw; placements: EcPlacement[] }>();
	const disks: StorageDisk[] = [];

	for (const dc of list(doc.data_centers)) {
		for (const rack of list(dc.racks)) {
			for (const node of list(rack.nodes)) {
				const where = { server: str(node.id), dataCenter: str(dc.id), rack: str(rack.id) };
				for (const disk of list(node.disks)) {
					const diskType = diskTypeOf(disk.disk_type);
					const diskId = num(disk.disk_id);
					const ecShards = list(disk.ec_shards);
					disks.push({
						...where,
						diskType,
						diskId,
						volumeCount: num(disk.volume_count),
						maxVolumeCount: num(disk.max_volume_count),
						freeVolumeCount: num(disk.free_volume_count),
						remoteVolumeCount: num(disk.remote_volume_count),
						ecShardCount: ecShards.reduce((sum, ec) => sum + list(ec.shard_ids).length, 0),
					});
					for (const v of list(disk.volumes)) {
						const id = num(v.id);
						const entry = replicasById.get(id) ?? { base: v, replicas: [] };
						entry.replicas.push({
							...where,
							diskType: diskTypeOf(v.disk_type, disk.disk_type),
							diskId: num(v.disk_id, diskId),
							size: num(v.size),
							fileCount: num(v.file_count),
							deleteCount: num(v.delete_count),
							deletedBytes: num(v.deleted_byte_count),
							readOnly: v.read_only === true,
							compactRevision: num(v.compact_revision),
							modifiedAt: epochToIso(num(v.modified_at_second)),
							remoteStorage: str(v.remote_storage_name),
						});
						replicasById.set(id, entry);
					}
					for (const ec of ecShards) {
						const id = num(ec.id);
						const sizes = Array.isArray(ec.shard_sizes) ? ec.shard_sizes : [];
						const shards = (Array.isArray(ec.shard_ids) ? ec.shard_ids : []).map((shardId, index) => ({
							id: num(shardId),
							size: num(sizes[index]),
						}));
						const entry = shardsById.get(id) ?? { base: ec, placements: [] };
						entry.placements.push({
							...where,
							diskType: diskTypeOf(ec.disk_type, disk.disk_type),
							diskId: num(ec.disk_id, diskId),
							shards,
							size: num(ec.total_size),
						});
						shardsById.set(id, entry);
					}
				}
			}
		}
	}

	const volumes: StorageVolume[] = [...replicasById.entries()]
		.sort(([a], [b]) => a - b)
		.map(([id, { base, replicas }]) => {
			const largest = replicas.reduce((max, r) => (r.size > max.size ? r : max));
			const replication = str(base.replica_placement) || "000";
			const modified = replicas
				.map((r) => r.modifiedAt)
				.filter((m): m is string => m !== null)
				.sort()
				.at(-1);
			return {
				id,
				collection: str(base.collection),
				replication,
				ttl: str(base.ttl),
				version: num(base.version),
				diskType: replicas[0]?.diskType ?? "hdd",
				size: largest.size,
				fileCount: largest.fileCount,
				deleteCount: largest.deleteCount,
				deletedBytes: largest.deletedBytes,
				garbageRatio: largest.size > 0 ? largest.deletedBytes / largest.size : 0,
				fullness: largest.size / volumeSizeLimitBytes,
				readOnly: replicas.some((r) => r.readOnly),
				modifiedAt: modified ?? null,
				replicas,
				expectedReplicas: copiesFor(replication),
			};
		});

	const ecVolumes: EcVolume[] = [...shardsById.entries()]
		.sort(([a], [b]) => a - b)
		.map(([id, { base, placements }]) => {
			const held = placements.flatMap((p) => p.shards.map((s) => s.id));
			const present = unique(held).sort((a, b) => a - b);
			const standard = DEFAULT_DATA_SHARDS + DEFAULT_PARITY_SHARDS;
			const totalShards = Math.max(standard, (present.at(-1) ?? 0) + 1);
			const isStandard = totalShards === standard;
			return {
				id,
				collection: str(base.collection),
				totalShards,
				dataShards: isStandard ? DEFAULT_DATA_SHARDS : 0,
				parityShards: isStandard ? DEFAULT_PARITY_SHARDS : 0,
				presentShards: present,
				missingShards: Array.from({ length: totalShards }, (_, i) => i).filter((i) => !present.includes(i)),
				duplicateShards: present.filter((shard) => held.indexOf(shard) !== held.lastIndexOf(shard)),
				size: placements.reduce((sum, p) => sum + p.size, 0),
				fileCount: num(base.file_count),
				deleteCount: num(base.delete_count),
				expiresAt: epochToIso(num(base.expire_at_sec)),
				placements,
			};
		});

	const collections = new Map<string, StorageCollection>();
	const collectionFor = (name: string) => {
		let collection = collections.get(name);
		if (!collection) {
			collection = {
				name,
				volumeCount: 0,
				ecVolumeCount: 0,
				size: 0,
				fileCount: 0,
				deleteCount: 0,
				deletedBytes: 0,
				servers: [],
				diskTypes: [],
				replications: [],
			};
			collections.set(name, collection);
		}
		return collection;
	};
	for (const v of volumes) {
		const c = collectionFor(v.collection);
		c.volumeCount++;
		c.size += v.size;
		c.fileCount += v.fileCount;
		c.deleteCount += v.deleteCount;
		c.deletedBytes += v.deletedBytes;
		c.servers.push(...v.replicas.map((r) => r.server));
		c.diskTypes.push(...v.replicas.map((r) => r.diskType));
		c.replications.push(v.replication);
	}
	for (const ec of ecVolumes) {
		const c = collectionFor(ec.collection);
		c.ecVolumeCount++;
		c.size += ec.size;
		c.fileCount += ec.fileCount;
		c.deleteCount += ec.deleteCount;
		c.servers.push(...ec.placements.map((p) => p.server));
		c.diskTypes.push(...ec.placements.map((p) => p.diskType));
	}

	const totals = obj(doc.totals);
	return {
		generatedAt: time(doc.generated_at),
		volumeSizeLimitBytes,
		totals: {
			volumes: volumes.length,
			ecVolumes: ecVolumes.length,
			ecShards: ecVolumes.reduce(
				(sum, ec) => sum + ec.placements.reduce((n, p) => n + p.shards.length, 0),
				0,
			),
			size: num(totals.total_size),
			files: num(totals.file_count),
			deletedFiles: num(totals.deleted_file_count),
			deletedBytes: num(totals.deleted_bytes),
		},
		volumes,
		ecVolumes,
		collections: [...collections.values()]
			.map((c) => ({
				...c,
				servers: sortedStrings(c.servers),
				diskTypes: sortedStrings(c.diskTypes),
				replications: sortedStrings(c.replications),
			}))
			.sort((a, b) => a.name.localeCompare(b.name)),
		disks,
		duplicateVolumeIds: list(doc.duplicate_volume_ids).map((d) => ({
			volumeId: num(d.volume_id),
			collections: Array.isArray(d.collections) ? d.collections.map((c) => str(c)) : [],
		})),
	};
}
