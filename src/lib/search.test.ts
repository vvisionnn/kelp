import { describe, expect, test } from "bun:test";
import { oneOf, text } from "./search.ts";

describe("search params", () => {
	test("text keeps strings and drops anything else", () => {
		expect(text("/a/b")).toBe("/a/b");
		expect(text(42)).toBeUndefined();
		expect(text(undefined)).toBeUndefined();
	});

	test("oneOf keeps only the listed words", () => {
		const tabs = ["settings", "jobs"] as const;
		expect(oneOf("jobs", tabs)).toBe("jobs");
		expect(oneOf("nope", tabs)).toBeUndefined();
		expect(oneOf(1, tabs)).toBeUndefined();
	});
});
