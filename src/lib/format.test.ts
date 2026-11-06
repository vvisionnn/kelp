import { describe, expect, test } from "bun:test";
import {
	formatBytes,
	formatCount,
	formatDateTime,
	formatPercent,
	formatRelative,
	plural,
	ratio,
} from "./format.ts";

describe("formatBytes", () => {
	test.each([
		[0, "0 B"],
		[512, "512 B"],
		[1536, "1.5 KiB"],
		[10 * 1024 ** 2, "10 MiB"],
		[245107195904, "228 GiB"],
		[3.5 * 1024 ** 4, "3.5 TiB"],
		[-1, "0 B"],
		[Number.NaN, "0 B"],
	])("%p -> %p", (bytes, text) => {
		expect(formatBytes(bytes)).toBe(text);
	});
});

describe("formatCount", () => {
	test.each([
		[0, "0"],
		[999, "999"],
		[1234, "1,234"],
		[1_250_000, "1.25M"],
	])("%p -> %p", (n, text) => {
		expect(formatCount(n)).toBe(text);
	});
});

describe("ratios", () => {
	test("ratio guards division by zero and clamps to 0..1", () => {
		expect(ratio(1, 4)).toBe(0.25);
		expect(ratio(5, 0)).toBe(0);
		expect(ratio(9, 4)).toBe(1);
	});

	test("formatPercent", () => {
		expect(formatPercent(0.7252)).toBe("72.5%");
		expect(formatPercent(0)).toBe("0%");
		expect(formatPercent(0.0004)).toBe("<0.1%");
		expect(formatPercent(1)).toBe("100%");
	});
});

describe("formatRelative", () => {
	const now = new Date("2026-11-04T12:00:00Z").getTime();
	test.each([
		["2026-11-04T11:59:58Z", "just now"],
		["2026-11-04T11:59:00Z", "1 min ago"],
		["2026-11-04T09:00:00Z", "3 hr ago"],
		["2026-11-01T12:00:00Z", "3 days ago"],
		["2025-11-04T12:00:00Z", "Nov 4, 2025"],
		["2026-11-04T12:05:00Z", "in 5 min"],
	])("%p -> %p", (iso, text) => {
		expect(formatRelative(iso, now)).toBe(text);
	});

	test("null means never", () => {
		expect(formatRelative(null, now)).toBe("never");
	});
});

describe("formatDateTime", () => {
	test("formats timestamps and shows a dash for missing ones", () => {
		expect(formatDateTime("2026-11-04T12:00:00Z")).toMatch(/Nov 4, 2026/);
		expect(formatDateTime(null)).toBe("—");
	});
});

test("plural names one thing in the singular and counts with grouping", () => {
	expect(plural(1, "volume")).toBe("1 volume");
	expect(plural(1204, "volume")).toBe("1,204 volumes");
	expect(plural(0, "policy", "policies")).toBe("0 policies");
});
