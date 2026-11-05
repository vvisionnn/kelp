import { describe, expect, test } from "bun:test";
import type { EcVolume, StorageCollection, StorageVolume } from "@shared/storage.ts";
import { busyInventory } from "../../../../test/storage-fixtures.ts";
import { makeTelemetry } from "../../../../test/telemetry-fixtures.ts";
import {
	averageObject,
	collectionBars,
	collectionSlices,
	ecSavings,
	fillColumns,
	fleetRank,
	garbageBars,
	hotVolumes,
	lastWriteColumns,
	protectionSlices,
	reads,
	replicationBars,
	shardsPerServer,
	volumesPerServer,
	volumeTraffic,
	writes,
} from "./insights.ts";

const NOW = Date.parse("2026-11-05T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const volume = (patch: Partial<StorageVolume>): StorageVolume => ({
	...(busyInventory().volumes[0] as StorageVolume),
	...patch,
});
const collection = (name: string, size: number, fileCount = 1): StorageCollection => ({
	name,
	size,
	fileCount,
	volumeCount: 1,
	ecVolumeCount: 0,
	deleteCount: 0,
	deletedBytes: 0,
	servers: [],
	diskTypes: [],
	replications: [],
});

describe("storage insights", () => {
	test("fill columns bucket volumes in 10% steps, clamping the ends", () => {
		const columns = fillColumns([
			volume({ fullness: 0 }),
			volume({ fullness: 0.55 }),
			volume({ fullness: 1.2 }),
		]);
		expect(columns.map((c) => c.value)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 1]);
		expect(columns[9]?.label).toBe("90%");
	});

	test("last write sorts volumes from hot to cold, with never-written ones as older", () => {
		const volumes = [
			volume({ modifiedAt: ago(60_000) }),
			volume({ modifiedAt: ago(3 * 3_600_000) }),
			volume({ modifiedAt: ago(3 * 86_400_000) }),
			volume({ modifiedAt: ago(10 * 86_400_000) }),
			volume({ modifiedAt: ago(90 * 86_400_000) }),
			volume({ modifiedAt: null }),
		];
		expect(lastWriteColumns(volumes, NOW).map((c) => c.value)).toEqual([1, 1, 1, 1, 2]);
		expect(hotVolumes(volumes, NOW)).toBe(2);
	});

	test("collection slices keep the four largest and fold the rest into Other", () => {
		const slices = collectionSlices([
			collection("a", 50),
			collection("", 40),
			collection("c", 30),
			collection("d", 20),
			collection("e", 10),
			collection("f", 5),
			collection("empty", 0),
		]);
		expect(slices.map((s) => s.label)).toEqual(["a", "Default", "c", "d", "Other"]);
		expect(slices[4]?.value).toBe(15);
		expect(collectionSlices([collection("a", 1)]).map((s) => s.label)).toEqual(["a"]);
	});

	test("collection bars rank by a measure and skip zeroes", () => {
		const bars = collectionBars(
			[collection("a", 10, 2), collection("", 30, 3), collection("z", 0, 0)],
			averageObject,
			(v) => `${v}`,
		);
		expect(bars.map((b) => [b.key, b.display])).toEqual([
			["(default)", "10"],
			["a", "5"],
		]);
		expect(averageObject(collection("x", 10, 0))).toBe(0);
	});

	test("garbage bars and replication bars rank volumes", () => {
		const volumes = [
			volume({ id: 1, deletedBytes: 10, garbageRatio: 0.1, replication: "000" }),
			volume({ id: 2, deletedBytes: 30, garbageRatio: 0.3, replication: "010" }),
			volume({ id: 3, deletedBytes: 0, replication: "010" }),
		];
		expect(garbageBars(volumes).map((b) => b.id)).toEqual([2, 1]);
		expect(replicationBars(volumes).map((b) => [b.label, b.value])).toEqual([
			["010", 2],
			["000", 1],
		]);
	});

	test("volume traffic splits reads from writes", () => {
		const point = makeTelemetry(2).points[0];
		if (!point) throw new Error("fixture");
		point.volume.byType = { GET: 2, HEAD: 1, POST: 3, PUT: 1, DELETE: 1 };
		expect(reads(point)).toBe(3);
		expect(writes(point)).toBe(5);
		point.volume.byType = {};
		expect([reads(point), writes(point)]).toEqual([0, 0]);
		expect(volumeTraffic(makeTelemetry(3).points).map((s) => s.values.length)).toEqual([3, 3]);
	});

	test("fleet rank places a volume among all volumes and its collection", () => {
		const inventory = busyInventory();
		const largest = [...inventory.volumes].sort((a, b) => b.size - a.size)[0] as StorageVolume;
		const rank = fleetRank(largest, inventory);
		expect(rank.rank).toBe(1);
		expect(rank.of).toBe(inventory.volumes.length);
		expect(rank.shareOfCollection).toBeGreaterThan(0);
	});

	test("EC helpers count shards per server, savings and protection", () => {
		const ec: EcVolume[] = busyInventory().ecVolumes;
		const perServer = shardsPerServer(ec);
		expect(perServer.reduce((sum, c) => sum + c.value, 0)).toBe(
			ec.reduce((sum, v) => sum + v.placements.reduce((n, p) => n + p.shards.length, 0), 0),
		);
		const savings = ecSavings(ec);
		expect(savings.data).toBeLessThan(savings.stored);
		expect(ecSavings([])).toEqual({ stored: 0, data: 0, saved: 0 });
		const slices = protectionSlices(busyInventory());
		expect(slices.map((s) => s.label)).toEqual(["Replicated volumes", "Erasure-coded shards"]);
		expect(volumesPerServer(busyInventory().volumes).length).toBeGreaterThan(0);
	});
});
