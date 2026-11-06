import { describe, expect, test } from "bun:test";
import type { Bucket } from "@shared/objects.ts";
import { entry } from "../../../../test/objects-fixtures.ts";
import { makeTelemetry } from "../../../../test/telemetry-fixtures.ts";
import {
	errorShare,
	fileKind,
	folderStats,
	nearQuota,
	quotaUsage,
	settledTelemetry,
	sizeColumns,
	sizeShares,
	trafficByBucket,
} from "./insights.ts";

const bucket = (name: string, logicalSize: number, quota = 0): Bucket =>
	({
		name,
		logicalSize,
		physicalSize: logicalSize,
		quota: { enabled: quota > 0, bytes: quota },
	}) as Bucket;

describe("object store insights", () => {
	test("traffic is keyed by bucket and failures are a share of requests", () => {
		const telemetry = makeTelemetry(3);
		expect(trafficByBucket(telemetry).get("backups")?.requests).toBe(900);
		expect(trafficByBucket(undefined).size).toBe(0);
		const shares = errorShare(telemetry.points);
		expect(shares[0]).toBeGreaterThan(0);
		const idle = {
			...telemetry.points[1],
			s3: { ...telemetry.points[1]?.s3, rps: 0 },
		} as (typeof telemetry.points)[number];
		expect(errorShare([idle])).toEqual([null]);
	});

	test("quotas are ranked fullest first and near-full ones counted", () => {
		const buckets = [bucket("a", 90, 100), bucket("b", 10, 100), bucket("c", 500)];
		expect(quotaUsage(buckets).map((q) => q.bucket.name)).toEqual(["a", "b"]);
		expect(nearQuota(buckets)).toBe(1);
	});

	test("size shares keep the largest and fold the rest into Other", () => {
		const buckets = [5, 4, 3, 2, 1, 0].map((n) => bucket(`b${n}`, n));
		expect(sizeShares(buckets, 2)).toEqual([
			{ label: "b5", value: 5 },
			{ label: "b4", value: 4 },
			{ label: "Other", value: 6 },
		]);
		expect(sizeShares(buckets.slice(0, 2), 4)).toHaveLength(2);
	});

	test("size columns label each bucket, with the open-ended one last", () => {
		expect(
			sizeColumns([
				{ le: 1048576, count: 3 },
				{ le: -1, count: 1 },
				{ le: 1024, count: 2 },
			]),
		).toEqual([
			{ label: "≤1KiB", value: 2 },
			{ label: "≤1MiB", value: 3 },
			{ label: ">1MiB", value: 1 },
		]);
	});

	test("files are grouped by kind and folders summarized", () => {
		expect(["a.PNG", "b.mp4", "c.pdf", "d.parquet", "e.log.gz", "f.tar", "g.ts", "h"].map(fileKind)).toEqual([
			"Images",
			"Video & audio",
			"Documents",
			"Data",
			"Logs",
			"Archives",
			"Code",
			"Other",
		]);
		const stats = folderStats([
			entry("/x/dir", { isDirectory: true, modifiedAt: "2026-01-03T00:00:00Z" }),
			entry("/x/a.png", { size: 100, modifiedAt: "2026-01-01T00:00:00Z" }),
			entry("/x/b.png", { size: 300, modifiedAt: null }),
			entry("/x/c.csv", { size: 50, modifiedAt: "2026-01-02T00:00:00Z" }),
		]);
		expect(stats).toMatchObject({ folders: 1, files: 3, bytes: 450 });
		expect(stats.newest?.name).toBe("dir");
		expect(stats.kinds.map((k) => k.kind)).toEqual(["Images", "Data"]);
		expect(stats.largest[0]?.name).toBe("b.png");
	});
});

describe("settledTelemetry", () => {
	test("waits for an answer, and treats any failure as no telemetry", () => {
		const telemetry = makeTelemetry();
		expect(settledTelemetry({ data: undefined, error: null, failureCount: 0 })).toBeUndefined();
		expect(settledTelemetry({ data: telemetry, error: null, failureCount: 0 })).toBe(telemetry);
		expect(settledTelemetry({ data: undefined, error: null, failureCount: 1 })).toBeNull();
		expect(settledTelemetry({ data: undefined, error: new Error("down"), failureCount: 3 })).toBeNull();
	});
});
