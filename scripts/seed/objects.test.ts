import { expect, test } from "bun:test";
import { SEED_BUCKETS, seedObjects } from "./objects.ts";

test("seed objects cover every bucket with unique keys and real bodies", () => {
	const objects = seedObjects();
	expect(new Set(objects.map((o) => o.bucket))).toEqual(new Set(SEED_BUCKETS));
	const keys = objects.map((o) => `${o.bucket}/${o.key}`);
	expect(new Set(keys).size).toBe(keys.length);
	expect(objects.filter((o) => o.key.startsWith("thumbnails/")).length).toBe(240);
	// One object per distinct generator function keeps this fast but complete.
	const generators = new Map(objects.map((o) => [o.body.toString(), o]));
	for (const object of generators.values()) expect(object.body().length).toBeGreaterThan(0);
	const backup = objects.find((o) => o.bucket === "backups");
	expect(backup?.body().length).toBe(6 * 1024 * 1024);
});
