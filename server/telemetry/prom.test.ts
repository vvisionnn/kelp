import { describe, expect, test } from "bun:test";
import { groupSum, increase, merge, parse, quantile, sumBy, total } from "./prom.ts";

const before = await Bun.file(new URL("../../fixtures/metrics/server-1.txt", import.meta.url)).text();
const after = await Bun.file(new URL("../../fixtures/metrics/server-2.txt", import.meta.url)).text();

describe("parse", () => {
	test("reads a real SeaweedFS scrape: names, labels and values, skipping comments", () => {
		const scrape = parse(after);
		const requests = scrape.get("SeaweedFS_s3_request_total") ?? [];
		expect(requests).toContainEqual({
			name: "SeaweedFS_s3_request_total",
			labels: { bucket: "photos", code: "404", type: "GET" },
			value: 6,
		});
		expect(total(scrape, "go_goroutines")).toBeGreaterThan(0);
		expect(scrape.has("# HELP")).toBe(false);
	});

	test("handles escapes, infinities, missing labels and junk lines", () => {
		const scrape = parse(
			[
				'm{a="x\\"y",b="line\\nbreak"} 1',
				'h_bucket{le="+Inf"} +Inf',
				"neg -Inf",
				"bare 2.5e+01",
				"not a metric line",
				"nan_value NaN",
				"",
			].join("\n"),
		);
		expect(scrape.get("m")?.[0]?.labels).toEqual({ a: 'x"y', b: "line\nbreak" });
		expect(scrape.get("h_bucket")?.[0]?.value).toBe(Number.POSITIVE_INFINITY);
		expect(scrape.get("neg")?.[0]?.value).toBe(Number.NEGATIVE_INFINITY);
		expect(scrape.get("bare")?.[0]).toEqual({ name: "bare", labels: {}, value: 25 });
		expect(scrape.has("nan_value")).toBe(false);
	});
});

describe("aggregation", () => {
	test("sums by label, filters with a predicate and merges processes", () => {
		const scrape = parse(after);
		expect(sumBy(scrape, "SeaweedFS_s3_request_total", "type")).toMatchObject({ GET: 15, PUT: 10, LIST: 2 });
		expect(total(scrape, "SeaweedFS_s3_request_total", (l) => l.code === "404")).toBe(6);
		expect(sumBy(scrape, "missing", "x")).toEqual({});
		const merged = merge([parse("a 1\nb 2"), parse("a 3")]);
		expect(total(merged, "a")).toBe(4);
		expect(total(merged, "b")).toBe(2);
	});

	test("counter increases between scrapes, treating a drop as a restart", () => {
		const delta = increase(parse(before), parse(after), "SeaweedFS_s3_request_total");
		const byCode = groupSum(delta, "code");
		expect(byCode["404"]).toBe(6);
		expect(groupSum(delta, "type").PUT).toBeGreaterThan(0);
		const reset = increase(
			parse('c{x="1"} 10\nc{x="2"} 4'),
			parse('c{x="1"} 3\nc{x="2"} 9\nc{x="3"} 1'),
			"c",
		);
		expect(reset.map((s) => s.value)).toEqual([3, 5, 1]);
	});
});

describe("quantile", () => {
	const histogram = (counts: Array<[string, number]>) =>
		parse(counts.map(([le, n]) => `h_bucket{le="${le}"} ${n}`).join("\n")).get("h_bucket") ?? [];

	test("interpolates within the bucket that holds the rank", () => {
		const buckets = histogram([
			["0.1", 50],
			["0.2", 90],
			["0.4", 100],
			["+Inf", 100],
		]);
		expect(quantile(0.5, buckets)).toBeCloseTo(0.1);
		expect(quantile(0.7, buckets)).toBeCloseTo(0.15);
		expect(quantile(0.95, buckets)).toBeCloseTo(0.3);
		expect(quantile(0.25, buckets)).toBeCloseTo(0.05);
	});

	test("sums series with the same bound, reports the lower edge of the open bucket, and is null when empty", () => {
		const twoSeries = [
			...histogram([
				["1", 1],
				["+Inf", 4],
			]),
			...histogram([
				["1", 1],
				["+Inf", 4],
			]),
		];
		expect(quantile(0.9, twoSeries)).toBe(1);
		expect(
			quantile(
				0.5,
				histogram([
					["1", 0],
					["+Inf", 0],
				]),
			),
		).toBeNull();
		expect(quantile(0.5, [])).toBeNull();
		const flat = histogram([
			["1", 5],
			["2", 5],
			["+Inf", 5],
		]);
		expect(quantile(0.5, flat)).toBeCloseTo(0.5);
		expect(quantile(0.5, parse('h_bucket{le="bad"} 3').get("h_bucket") ?? [])).toBeNull();
	});

	test("finds real S3 latencies in the fixture", () => {
		const latency = increase(parse(before), parse(after), "SeaweedFS_s3_request_seconds_bucket");
		const p95 = quantile(0.95, latency);
		expect(p95).not.toBeNull();
		expect(p95 as number).toBeGreaterThan(0);
		expect(p95 as number).toBeLessThan(1);
	});
});
