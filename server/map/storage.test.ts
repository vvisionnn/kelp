import { describe, expect, test } from "bun:test";
import { copiesFor, mapInventory } from "./storage.ts";

const fixture = (name: string) => Bun.file(`${import.meta.dir}/../../fixtures/${name}.json`).json();

function node(id: string, disks: unknown[]) {
	return { id, grpc_port: 18080, disks };
}

function exportOf(nodes: Array<{ dc?: string; rack?: string; node: unknown }>) {
	return {
		generated_at: "2026-11-04T14:00:00Z",
		volume_size_limit_mb: 100,
		totals: {
			volume_count: 3,
			ec_shard_count: 2,
			total_size: 1,
			file_count: 2,
			deleted_file_count: 1,
			deleted_bytes: 5,
		},
		duplicate_volume_ids: [{ volume_id: 7, collections: ["a", "b"] }],
		data_centers: [
			{
				id: "dc1",
				racks: [{ id: "r1", nodes: nodes.filter((n) => !n.rack).map((n) => n.node) }],
			},
			{ id: "dc2", racks: [{ id: "r2", nodes: nodes.filter((n) => n.rack).map((n) => n.node) }] },
		],
	};
}

const volume = (over: Record<string, unknown>) => ({
	id: 1,
	collection: "media",
	size: 50 * 1024 * 1024,
	file_count: 10,
	delete_count: 2,
	deleted_byte_count: 5 * 1024 * 1024,
	replica_placement: "001",
	version: 3,
	ttl: "",
	read_only: false,
	compact_revision: 1,
	modified_at_second: 1793798291,
	disk_type: "",
	disk_id: 0,
	...over,
});

describe("mapInventory", () => {
	test("maps a real export with an EC volume", async () => {
		const inventory = mapInventory(await fixture("admin/volumes-export-ec"));
		expect(inventory.volumeSizeLimitBytes).toBe(256 * 1024 * 1024);
		expect(inventory.volumes.map((v) => v.id)).toEqual([1, 2, 3, 4, 6]);
		expect(inventory.ecVolumes).toHaveLength(1);
		const ec = inventory.ecVolumes[0];
		expect(ec).toMatchObject({ id: 5, collection: "logs", totalShards: 14, dataShards: 10, parityShards: 4 });
		expect(ec?.missingShards).toEqual([]);
		expect(ec?.placements[0]?.shards).toHaveLength(14);
		expect(inventory.totals.ecVolumes).toBe(1);
		expect(inventory.totals.ecShards).toBe(14);
		expect(inventory.collections.map((c) => c.name)).toEqual(["backups", "logs", "media"]);
		expect(inventory.collections.find((c) => c.name === "logs")).toMatchObject({
			volumeCount: 1,
			ecVolumeCount: 1,
		});
		expect(inventory.disks[0]).toMatchObject({ server: "127.0.0.1:8380", diskType: "hdd", ecShardCount: 14 });
	});

	test("groups replicas, flags read-only copies and computes ratios", () => {
		const inventory = mapInventory(
			exportOf([
				{
					node: node("a:8080", [
						{
							disk_type: "",
							disk_id: 0,
							volume_count: 1,
							max_volume_count: 8,
							free_volume_count: 7,
							volumes: [volume({})],
						},
					]),
				},
				{
					rack: "r2",
					node: node("b:8080", [
						{
							disk_type: "ssd",
							disk_id: 1,
							volume_count: 1,
							max_volume_count: 8,
							free_volume_count: 7,
							volumes: [volume({ read_only: true, size: 40 * 1024 * 1024, modified_at_second: 0 })],
						},
					]),
				},
			]),
		);
		const [v] = inventory.volumes;
		expect(v?.replicas.map((r) => [r.server, r.dataCenter, r.rack, r.readOnly])).toEqual([
			["a:8080", "dc1", "r1", false],
			["b:8080", "dc2", "r2", true],
		]);
		expect(v).toMatchObject({ readOnly: true, size: 50 * 1024 * 1024, expectedReplicas: 2, diskType: "hdd" });
		expect(v?.garbageRatio).toBeCloseTo(0.1);
		expect(v?.fullness).toBeCloseTo(0.5);
		expect(v?.replicas[1]?.modifiedAt).toBeNull();
		expect(inventory.duplicateVolumeIds).toEqual([{ volumeId: 7, collections: ["a", "b"] }]);
		expect(inventory.collections).toEqual([
			expect.objectContaining({
				name: "media",
				volumeCount: 1,
				servers: ["a:8080", "b:8080"],
				diskTypes: ["hdd", "ssd"],
				replications: ["001"],
			}),
		]);
	});

	test("finds missing and duplicated EC shards across servers", () => {
		const shardSet = (id: number, shardIds: number[]) => ({
			id,
			collection: "",
			shard_ids: shardIds,
			shard_sizes: shardIds.map(() => 10),
			total_size: shardIds.length * 10,
			file_count: 4,
			delete_count: 1,
			disk_type: "",
			disk_id: 0,
			expire_at_sec: id === 9 ? 1793798291 : 0,
		});
		const inventory = mapInventory(
			exportOf([
				{
					node: node("a:8080", [
						{ disk_type: "", disk_id: 0, ec_shards: [shardSet(9, [0, 1, 2, 3, 4, 5, 6])] },
					]),
				},
				{
					rack: "r2",
					node: node("b:8080", [
						{ disk_type: "", disk_id: 0, ec_shards: [shardSet(9, [6, 7, 8, 9, 10, 11]), shardSet(2, [0])] },
					]),
				},
			]),
		);
		expect(inventory.ecVolumes.map((v) => v.id)).toEqual([2, 9]);
		const ec = inventory.ecVolumes[1];
		expect(ec?.missingShards).toEqual([12, 13]);
		expect(ec?.duplicateShards).toEqual([6]);
		expect(ec?.presentShards).toHaveLength(12);
		expect(ec?.size).toBe(130);
		expect(ec?.expiresAt).toBe("2026-11-04T13:18:11.000Z");
		expect(ec?.placements.map((p) => p.server)).toEqual(["a:8080", "b:8080"]);
		expect(inventory.collections[0]).toMatchObject({ name: "", ecVolumeCount: 2, volumeCount: 0 });
	});

	test("custom encodings wider than 10+4 are reported as is", () => {
		const inventory = mapInventory(
			exportOf([
				{
					node: node("a:8080", [
						{
							disk_type: "",
							ec_shards: [{ id: 3, collection: "x", shard_ids: [0, 15], shard_sizes: [1], total_size: 2 }],
						},
					]),
				},
			]),
		);
		const [ec] = inventory.ecVolumes;
		expect(ec).toMatchObject({ totalShards: 16, dataShards: 0, parityShards: 0 });
		expect(ec?.placements[0]?.shards).toEqual([
			{ id: 0, size: 1 },
			{ id: 15, size: 0 },
		]);
	});

	test("tolerates an empty or malformed export", () => {
		const inventory = mapInventory(null);
		expect(inventory).toMatchObject({
			generatedAt: null,
			volumes: [],
			ecVolumes: [],
			collections: [],
			disks: [],
		});
		expect(inventory.volumeSizeLimitBytes).toBe(30_000 * 1024 * 1024);
	});
});

test("copiesFor reads the replication digits", () => {
	expect(copiesFor("000")).toBe(1);
	expect(copiesFor("010")).toBe(2);
	expect(copiesFor("112")).toBe(5);
	expect(copiesFor("")).toBe(1);
	expect(copiesFor("abc")).toBe(1);
});
