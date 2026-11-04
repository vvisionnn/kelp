import { describe, expect, test } from "bun:test";
import { ApiError } from "./lib/api.ts";
import { createQueryClient } from "./router.tsx";

describe("query client", () => {
	const retry = createQueryClient().getDefaultOptions().queries?.retry as (
		count: number,
		error: unknown,
	) => boolean;

	test("retries transient failures twice", () => {
		expect(retry(0, new ApiError(502, "down", "admin"))).toBe(true);
		expect(retry(1, new ApiError(0, "unreachable"))).toBe(true);
		expect(retry(2, new ApiError(502, "down"))).toBe(false);
		expect(retry(0, new Error("network"))).toBe(true);
	});

	test("never retries client errors", () => {
		expect(retry(0, new ApiError(404, "missing"))).toBe(false);
		expect(retry(0, new ApiError(401, "sign in"))).toBe(false);
	});
});
