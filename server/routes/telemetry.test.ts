import { afterEach, describe, expect, test } from "bun:test";
import { type Harness, harness } from "../../test/harness.ts";
import { inventoryFrom } from "../map/cluster.ts";
import type { Raw } from "../map/raw.ts";

let h: Harness;
afterEach(() => h.stop());

describe("telemetry", () => {
	test("serves the sampler's snapshot for a range, an hour by default", async () => {
		h = await harness();
		const hour = await h.json("GET", "/telemetry");
		expect(hour.status).toBe(200);
		expect(hour.body).toMatchObject({ enabled: false, range: "1h", stepSeconds: 15, points: [] });
		const day = await h.json("GET", "/telemetry?range=24h");
		expect(day.body).toMatchObject({ range: "24h", stepSeconds: 300 });
	});

	test("rejects unknown ranges", async () => {
		h = await harness();
		const { status, body } = await h.json("GET", "/telemetry?range=7d");
		expect(status).toBe(400);
		expect(body.error).toMatch(/15m, 1h, 6h, 24h/);
	});

	test("viewers can read it", async () => {
		h = await harness({ role: "viewer" });
		expect((await h.json("GET", "/telemetry?range=15m")).status).toBe(200);
	});
});

describe("inventoryFrom", () => {
	test("reads holdings and disk from the admin dashboard", async () => {
		const dashboard = (await Bun.file(
			new URL("../../fixtures/admin/admin.json", import.meta.url),
		).json()) as Raw;
		const inventory = inventoryFrom(dashboard);
		expect(inventory.volumes).toBeGreaterThan(0);
		expect(inventory.storedBytes).toBeGreaterThan(0);
		expect(inventory.diskTotalBytes).toBeGreaterThanOrEqual(inventory.diskUsedBytes);
		expect(inventoryFrom({})).toEqual({
			storedBytes: 0,
			files: 0,
			volumes: 0,
			diskUsedBytes: 0,
			diskTotalBytes: 0,
		});
	});
});
