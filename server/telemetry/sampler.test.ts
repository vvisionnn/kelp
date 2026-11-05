import { afterEach, describe, expect, test } from "bun:test";
import { parse } from "./prom.ts";
import { pointFrom, ROLLUP_SECONDS, rollup, SCRAPE_SECONDS, TelemetrySampler } from "./sampler.ts";

const before = await Bun.file(new URL("../../fixtures/metrics/server-1.txt", import.meta.url)).text();
const after = await Bun.file(new URL("../../fixtures/metrics/server-2.txt", import.meta.url)).text();

const SERVER = "http://seaweedfs:9327/metrics";
const ADMIN = "http://admin:9328/metrics";

/** A sampler on a fake clock whose endpoints answer with whatever `bodies` holds right now. */
function setup(urls = [SERVER]) {
	let now = 1_000_000;
	const bodies = new Map<string, string | Error | number>();
	const inventory = { storedBytes: 100, files: 10, volumes: 2, diskUsedBytes: 50, diskTotalBytes: 200 };
	const sampler = new TelemetrySampler({
		urls,
		now: () => now,
		inventory: async () => {
			if (inventory.storedBytes < 0) throw new Error("admin down");
			return { ...inventory };
		},
		fetch: async (url) => {
			const body = bodies.get(url);
			if (body instanceof Error) throw body;
			if (typeof body === "number") return new Response("nope", { status: body });
			return new Response(body ?? "");
		},
	});
	return {
		sampler,
		bodies,
		inventory,
		advance: (seconds: number) => {
			now += seconds * 1000;
		},
		get now() {
			return now;
		},
	};
}

/** A minimal scrape with an S3 request count per bucket. */
const counts = (n: number, extra = "") =>
	[
		`SeaweedFS_s3_request_total{bucket="media",code="200",type="GET"} ${n}`,
		`SeaweedFS_s3_request_total{bucket="logs",code="500",type="PUT"} ${Math.floor(n / 2)}`,
		`SeaweedFS_s3_request_seconds_bucket{bucket="media",type="GET",le="0.01"} ${n}`,
		`SeaweedFS_s3_request_seconds_bucket{bucket="media",type="GET",le="+Inf"} ${n}`,
		`process_cpu_seconds_total ${n / 10}`,
		extra,
	].join("\n");

describe("pointFrom", () => {
	test("turns two real scrapes into rates, error rates, latencies and process health", () => {
		const { point, buckets } = pointFrom(parse(before), parse(after), 4, 42);
		expect(point.t).toBe(42);
		expect(point.s3.rps).toBeGreaterThan(0);
		expect(point.s3.byType.GET).toBeGreaterThan(0);
		expect(point.s3.clientErrors).toBe(6 / 4);
		expect(point.s3.serverErrors).toBe(0);
		expect(point.s3.p95).toBeGreaterThan(0);
		expect(point.filer.byType.GET).toBeGreaterThan(0);
		expect(point.volume.rps).toBeGreaterThan(0);
		expect(point.store.find).toBeGreaterThan(0);
		expect(point.process.memoryBytes).toBeGreaterThan(0);
		expect(point.process.goroutines).toBeGreaterThan(0);
		expect(point.process.cpuPercent).toBeGreaterThanOrEqual(0);
		expect(buckets.photos?.errors).toBe(6);
		// Requests without a bucket (ListBuckets) are not attributed to one.
		expect(Object.keys(buckets)).toEqual(["photos"]);
	});

	test("idle components have no latency, and resident memory wins when reported", () => {
		const { point } = pointFrom(
			parse("process_resident_memory_bytes 5\ngo_memstats_sys_bytes 9"),
			parse("process_resident_memory_bytes 7\ngo_memstats_sys_bytes 9"),
			15,
			0,
		);
		expect(point.s3).toEqual({
			rps: 0,
			byType: {},
			clientErrors: 0,
			serverErrors: 0,
			p50: null,
			p95: null,
			p99: null,
		});
		expect(point.process.memoryBytes).toBe(7);
	});
});

describe("rollup", () => {
	test("averages rates and keeps the worst latency", () => {
		const a = pointFrom(parse(counts(0)), parse(counts(30)), 15, 1);
		const b = pointFrom(parse(counts(30)), parse(counts(30)), 15, 2);
		const rolled = rollup([a, b], 3);
		expect(rolled.point.t).toBe(3);
		expect(rolled.point.s3.rps).toBeCloseTo((a.point.s3.rps + b.point.s3.rps) / 2);
		expect(rolled.point.s3.byType.GET).toBeCloseTo(1);
		expect(rolled.point.s3.p95).toBe(a.point.s3.p95);
		expect(rolled.buckets.media?.requests).toBe(30);
		expect(rolled.buckets.logs?.errors).toBe(15);
	});
});

describe("TelemetrySampler", () => {
	let stopper: TelemetrySampler | undefined;
	afterEach(() => stopper?.stop());

	test("is disabled without endpoints and reports an empty snapshot", () => {
		const sampler = new TelemetrySampler({
			urls: [],
			inventory: async () => ({ storedBytes: 0, files: 0, volumes: 0, diskUsedBytes: 0, diskTotalBytes: 0 }),
		});
		sampler.start();
		const snapshot = sampler.snapshot("1h");
		expect(snapshot).toMatchObject({
			enabled: false,
			since: null,
			points: [],
			buckets: [],
			disks: [],
			objectSizes: [],
		});
	});

	test("records a point per scrape after the first, with bucket series aligned to points", async () => {
		const s = setup();
		s.bodies.set(SERVER, counts(0));
		await s.sampler.scrape();
		expect(s.sampler.snapshot("15m").points).toHaveLength(0);
		for (let i = 1; i <= 3; i++) {
			s.advance(SCRAPE_SECONDS);
			s.bodies.set(SERVER, counts(i * 30));
			await s.sampler.scrape();
		}
		const snap = s.sampler.snapshot("15m");
		expect(snap.enabled).toBe(true);
		expect(snap.stepSeconds).toBe(SCRAPE_SECONDS);
		expect(snap.points).toHaveLength(3);
		expect(snap.points[0]?.s3.rps).toBeCloseTo(45 / 15);
		expect(snap.buckets.map((b) => b.bucket)).toEqual(["media", "logs"]);
		const media = snap.buckets[0];
		expect(media?.series).toEqual([2, 2, 2]);
		expect(media?.rps).toBe(2);
		expect(media?.requests).toBe(90);
		expect(snap.buckets[1]?.errors).toBe(45);
	});

	test("a scrape at the same instant records nothing", async () => {
		const s = setup();
		s.bodies.set(SERVER, counts(0));
		await s.sampler.scrape();
		await s.sampler.scrape();
		expect(s.sampler.snapshot("15m").points).toHaveLength(0);
	});

	test("rolls 15-second points into 5-minute points for the long ranges", async () => {
		const s = setup();
		let n = 0;
		s.bodies.set(SERVER, counts(n));
		await s.sampler.scrape();
		const scrapesPerRollup = ROLLUP_SECONDS / SCRAPE_SECONDS;
		for (let i = 0; i < scrapesPerRollup * 4; i++) {
			s.advance(SCRAPE_SECONDS);
			n += 15;
			s.bodies.set(SERVER, counts(n));
			await s.sampler.scrape();
		}
		const day = s.sampler.snapshot("24h");
		expect(day.stepSeconds).toBe(ROLLUP_SECONDS);
		expect(day.points).toHaveLength(4);
		expect(day.points[0]?.s3.byType.GET).toBeCloseTo(1);
		expect(day.buckets[0]?.series[0]).toBeCloseTo(1);
		expect(s.sampler.snapshot("6h").points).toHaveLength(4);
		// The hour view keeps every scrape; the 15-minute view only the last 60.
		expect(s.sampler.snapshot("1h").points).toHaveLength(scrapesPerRollup * 4);
		expect(s.sampler.snapshot("15m").points).toHaveLength(60);
	});

	test("keeps working when an endpoint fails, and says which", async () => {
		const s = setup([SERVER, ADMIN]);
		s.bodies.set(SERVER, counts(0));
		s.bodies.set(ADMIN, new Error("connection refused"));
		await s.sampler.scrape();
		expect(s.sampler.snapshot("1h").unreachable).toEqual([ADMIN]);
		s.advance(SCRAPE_SECONDS);
		s.bodies.set(SERVER, 503);
		s.bodies.set(ADMIN, "SeaweedFS_admin_workers_connected 1");
		await s.sampler.scrape();
		expect(s.sampler.snapshot("1h").unreachable).toEqual([SERVER]);
	});

	test("reports object sizes per bucket and disks from the latest scrape", async () => {
		const s = setup();
		s.bodies.set(SERVER, after);
		await s.sampler.scrape();
		const snap = s.sampler.snapshot("1h");
		expect(snap.objectSizes.at(-1)?.le).toBe(-1);
		expect(snap.objectSizes.reduce((a, b) => a + b.count, 0)).toBe(13);
		expect(snap.objectSizes[0]).toEqual({ le: 1024, count: 10 });
		expect(snap.disks).toEqual([
			{ path: "/tmp/tstack", usedBytes: expect.any(Number), totalBytes: expect.any(Number) },
		]);
		expect((snap.disks[0]?.usedBytes ?? 0) < (snap.disks[0]?.totalBytes ?? 0)).toBe(true);
	});

	test("ignores malformed histogram bounds when reporting object sizes", async () => {
		const s = setup();
		s.bodies.set(
			SERVER,
			'SeaweedFS_filer_object_size_bytes_bucket{le="x"} 1\nSeaweedFS_filer_object_size_bytes_bucket{le="10"} 2',
		);
		await s.sampler.scrape();
		expect(s.sampler.snapshot("1h").objectSizes).toEqual([{ le: 10, count: 2 }]);
	});

	test("records inventory, skipping moments the cluster is unreachable", async () => {
		const s = setup();
		await s.sampler.recordInventory();
		s.advance(60);
		s.inventory.storedBytes = -1;
		await s.sampler.recordInventory();
		s.advance(60);
		s.inventory.storedBytes = 300;
		await s.sampler.recordInventory();
		const inventory = s.sampler.snapshot("1h").inventory;
		expect(inventory.map((p) => p.storedBytes)).toEqual([100, 300]);
		expect(inventory[1]?.t).toBe(s.now);
	});

	test("start scrapes and samples right away, remembers when it began, and stop is idempotent", async () => {
		const s = setup();
		stopper = s.sampler;
		s.bodies.set(SERVER, counts(0));
		s.sampler.start();
		s.sampler.start();
		await Bun.sleep(5);
		const snap = s.sampler.snapshot("1h");
		expect(snap.since).toBe(s.now);
		expect(snap.inventory).toHaveLength(1);
		s.sampler.stop();
		s.sampler.stop();
	});

	test("uses the global fetch by default and times out slow endpoints", async () => {
		const server = Bun.serve({ port: 0, fetch: () => new Response(counts(1)) });
		try {
			const sampler = new TelemetrySampler({
				urls: [`http://127.0.0.1:${server.port}/metrics`],
				inventory: async () => ({
					storedBytes: 0,
					files: 0,
					volumes: 0,
					diskUsedBytes: 0,
					diskTotalBytes: 0,
				}),
			});
			await sampler.scrape();
			expect(sampler.snapshot("1h").unreachable).toEqual([]);
		} finally {
			server.stop(true);
		}
	});
});
