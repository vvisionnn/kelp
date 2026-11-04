import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type Harness, harness } from "../../test/harness.ts";
import { displayUrl } from "./settings.ts";

let h: Harness;
beforeEach(async () => {
	h = await harness({ role: "viewer" });
});
afterEach(() => h.stop());

describe("Kelp settings", () => {
	test("summarizes upstreams and session settings for any signed-in user", async () => {
		const { status, body } = await h.json("GET", "/system/kelp");
		expect(status).toBe(200);
		expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
		expect(body.upstreams.map((u: { label: string }) => u.label)).toEqual([
			"Admin API",
			"Master",
			"Master gRPC",
			"Filer",
			"Filer gRPC",
		]);
		expect(body.viewerEnabled).toBe(true);
		expect(body.sessionTtlHours).toBeGreaterThan(0);
		expect(body.s3Endpoint).toBeNull();
	});

	test("never shows credentials embedded in URLs", () => {
		expect(displayUrl("http://user:pass@seaweed:23646/")).toBe("http://seaweed:23646");
		expect(displayUrl("not a url //u:p@host")).toBe("not a url //host");
	});
});
