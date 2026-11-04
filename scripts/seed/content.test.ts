import { describe, expect, test } from "bun:test";
import { gunzipSync, inflateSync } from "node:zlib";
import { accessLog, blob, crc32, frondSvg, gradientPng, random, salesCsv } from "./content.ts";

describe("seed content", () => {
	test("the PRNG is deterministic and in [0, 1)", () => {
		const a = random(7);
		const b = random(7);
		const values = Array.from({ length: 100 }, () => a());
		expect(values).toEqual(Array.from({ length: 100 }, () => b()));
		expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
	});

	test("crc32 matches the reference value", () => {
		expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
	});

	test("gradientPng writes a valid PNG with the right size and pixels", () => {
		const png = gradientPng(4, 3, [0, 0, 0], [255, 255, 255]);
		expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
		const view = new DataView(png.buffer);
		expect(view.getUint32(16)).toBe(4);
		expect(view.getUint32(20)).toBe(3);
		const idatLength = view.getUint32(33);
		const raw = inflateSync(png.subarray(41, 41 + idatLength));
		expect(raw.length).toBe((4 * 3 + 1) * 3);
		expect(raw[0]).toBe(0);
	});

	test("text formats", () => {
		expect(frondSvg(160)).toStartWith("<svg");
		const log = gunzipSync(accessLog(3)).toString();
		expect(log.trim().split("\n")).toHaveLength(3);
		expect(log).toMatch(/"GET \/\S* HTTP\/1\.1" \d{3} \d+/);
		const csv = salesCsv(2).trim().split("\n");
		expect(csv[0]).toBe("date,region,orders,revenue_usd");
		expect(csv).toHaveLength(9);
	});

	test("blob has the requested size and is not trivially compressible", () => {
		const bytes = blob(1001, 3);
		expect(bytes.length).toBe(1001);
		expect(new Set(bytes).size).toBeGreaterThan(200);
	});
});
