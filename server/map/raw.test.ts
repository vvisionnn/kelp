import { describe, expect, test } from "bun:test";
import { bool, list, nanos, num, obj, str, strings, time } from "./raw.ts";

describe("raw readers", () => {
	test("primitives fall back on wrong types", () => {
		expect(str(1)).toBe("");
		expect(str(undefined, "x")).toBe("x");
		expect(num("42")).toBe(42);
		expect(num(" ")).toBe(0);
		expect(num("abc", 7)).toBe(7);
		expect(num(Number.POSITIVE_INFINITY)).toBe(0);
		expect(bool("true")).toBe(false);
		expect(bool(true)).toBe(true);
	});

	test("collections tolerate null", () => {
		expect(list(null)).toEqual([]);
		expect(list([{ a: 1 }])).toEqual([{ a: 1 }]);
		expect(strings(["a", 1, "b"])).toEqual(["a", "b"]);
		expect(strings("a")).toEqual([]);
		expect(obj([1])).toEqual({});
		expect(obj(null)).toEqual({});
		expect(obj({ a: 1 })).toEqual({ a: 1 });
	});

	test("times", () => {
		expect(time("0001-01-01T00:00:00Z")).toBeNull();
		expect(time("garbage")).toBeNull();
		expect(time("2026-01-02T03:04:05Z")).toBe("2026-01-02T03:04:05.000Z");
		expect(nanos("1767323045000000000")).toBe("2026-01-02T03:04:05.000Z");
		expect(nanos(0)).toBeNull();
	});
});
