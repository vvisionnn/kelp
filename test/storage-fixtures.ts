import type { StorageInventory } from "@shared/storage.ts";
import { mapInventory } from "../server/map/storage.ts";
import { fixture } from "./render-app.tsx";

/** The real export captured from SeaweedFS 4.52: one server, one EC volume. */
export async function realInventory(): Promise<StorageInventory> {
	return mapInventory(await fixture("admin/volumes-export-ec"));
}

const MB = 1024 * 1024;

function volume(id: number, collection: string, over: Record<string, unknown> = {}) {
	return {
		id,
		collection,
		size: 10 * MB,
		file_count: 100,
		delete_count: 0,
		deleted_byte_count: 0,
		replica_placement: "000",
		version: 3,
		ttl: "",
		read_only: false,
		compact_revision: 0,
		modified_at_second: Math.floor(Date.now() / 1000) - 60,
		disk_type: "",
		disk_id: 0,
		...over,
	};
}

function ec(id: number, collection: string, shardIds: number[]) {
	return {
		id,
		collection,
		shard_ids: shardIds,
		shard_sizes: shardIds.map(() => MB),
		total_size: shardIds.length * MB,
		file_count: 50,
		delete_count: 2,
		disk_type: "",
		disk_id: 0,
	};
}

/**
 * A busier cluster: six servers in two data centers, garbage, read-only and under-replicated
 * volumes, six collections, and EC volumes that are complete, damaged, unreadable and duplicated.
 */
export function busyInventory(): StorageInventory {
	const server = (id: string, volumes: unknown[], ecShards: unknown[] = []) => ({
		id,
		disks: [
			{
				disk_type: id.startsWith("ssd") ? "ssd" : "hdd",
				disk_id: 0,
				volume_count: volumes.length,
				max_volume_count: 20,
				free_volume_count: 20 - volumes.length,
				volumes,
				ec_shards: ecShards,
			},
		],
	});
	return mapInventory({
		generated_at: new Date().toISOString(),
		volume_size_limit_mb: 100,
		totals: { total_size: 200 * MB, file_count: 900, deleted_file_count: 40, deleted_bytes: 9 * MB },
		duplicate_volume_ids: [],
		data_centers: [
			{
				id: "dc1",
				racks: [
					{
						id: "r1",
						nodes: [
							server(
								"a:8080",
								[
									volume(1, "media", { replica_placement: "001" }),
									volume(2, "media", { deleted_byte_count: 5 * MB, delete_count: 20 }),
									volume(3, "logs", { read_only: true }),
									volume(4, "backups", { replica_placement: "010" }),
								],
								[ec(20, "archive", [0, 1, 2, 3, 4, 5, 6])],
							),
							server(
								"b:8080",
								[volume(1, "media", { replica_placement: "001" }), volume(5, "")],
								[
									ec(20, "archive", [7, 8, 9, 10, 11, 12, 13]),
									ec(21, "archive", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
								],
							),
							server("c:8080", [volume(6, "photos")], [ec(22, "cold", [0, 1, 2, 3, 4, 5, 6, 7, 8])]),
						],
					},
				],
			},
			{
				id: "dc2",
				racks: [
					{
						id: "r9",
						nodes: [
							server("d:8080", [volume(7, "videos")], [ec(20, "archive", [3])]),
							server(
								"e:8080",
								[volume(8, "videos")],
								[ec(23, "cold", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])],
							),
							server("ssd-f:8080", [volume(9, "scratch", { ttl: "7d" })], [ec(23, "cold", [13])]),
						],
					},
				],
			},
		],
	});
}
