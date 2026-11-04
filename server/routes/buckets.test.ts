import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type Harness, harness } from "../../test/harness.ts";

let h: Harness;
beforeEach(async () => {
	h = await harness();
	h.admin.fixture("GET /api/s3/buckets", "admin/buckets-all");
	h.admin.fixture("GET /api/s3/buckets/archive", "admin/bucket-locked");
	h.admin.fixture("GET /api/s3/buckets/archive/lifecycle", "admin/bucket-lifecycle-rules");
	h.admin.fixture("GET /api/s3/buckets/archive/policy", "admin/bucket-policy-set");
	h.admin.fixture("GET /api/users", "admin/users");
	h.master.fixture("GET /vol/status", "master/vol-status");
	for (const route of [
		"POST /api/s3/buckets",
		"DELETE /api/s3/buckets/archive",
		"PUT /api/s3/buckets/archive/quota",
		"PUT /api/s3/buckets/archive/owner",
		"PUT /api/s3/buckets/archive/lifecycle",
		"DELETE /api/s3/buckets/archive/lifecycle",
		"PUT /api/s3/buckets/archive/policy",
		"DELETE /api/s3/buckets/archive/policy",
	]) {
		h.admin.on(route, { message: "ok" });
	}
});
afterEach(() => h.stop());

const rule = {
	id: "logs",
	enabled: true,
	prefix: "logs/",
	tags: { env: "dev" },
	sizeGreaterThan: null,
	sizeLessThan: null,
	expirationDays: 30,
	expirationDate: null,
	expiredDeleteMarkers: false,
	noncurrentExpirationDays: null,
	newerNoncurrentVersions: null,
	abortMultipartDays: null,
};

describe("bucket list and details", () => {
	test("lists buckets with settings and live collection stats", async () => {
		const { status, body } = await h.json("GET", "/buckets");
		expect(status).toBe(200);
		const byName = Object.fromEntries(body.buckets.map((b: { name: string }) => [b.name, b]));
		expect(byName.backups).toMatchObject({
			quota: { enabled: true, bytes: 10737418240 },
			versioning: "Enabled",
			storedFiles: 1,
			volumes: 7,
		});
		expect(byName.media).toMatchObject({
			versioning: "Off",
			storedFiles: 4,
			objectLock: { enabled: false, mode: null },
		});
		expect(byName.archive).toMatchObject({
			storedFiles: null,
			objectLock: { enabled: true, mode: "GOVERNANCE", retentionDays: 7 },
			lifecycle: { rules: 2, enabled: 1 },
			policyStatements: 1,
		});
	});

	test("still lists buckets when the master is unavailable", async () => {
		h.master.on("GET /vol/status", () => new Response("down", { status: 503 }));
		const { body } = await h.json("GET", "/buckets");
		expect(body.buckets.every((b: { storedFiles: unknown }) => b.storedFiles === null)).toBe(true);
	});

	test("shows one bucket", async () => {
		const { body } = await h.json("GET", "/buckets/archive");
		expect(body.bucket).toMatchObject({ name: "archive", quota: { enabled: true, bytes: 1048576 } });
	});

	test("rejects invalid bucket names before calling SeaweedFS", async () => {
		const { status, body } = await h.json("GET", "/buckets/Not_Valid");
		expect(status).toBe(400);
		expect(body.error).toContain("lowercase");
	});

	test("owner choices are user names only, never credentials", async () => {
		const response = await h.get("/bucket-owners");
		const text = await response.text();
		expect(JSON.parse(text).owners).toEqual(["admin", "ci-bot"]);
		expect(text).not.toContain("secret");
	});
});

describe("creating and changing buckets", () => {
	test("creates a bucket with quota, versioning and object lock", async () => {
		const { status } = await h.json("POST", "/buckets", {
			name: "media-2026",
			owner: " ci-bot ",
			quotaBytes: 5 * 1024 ** 3,
			versioning: true,
			objectLock: { mode: "COMPLIANCE", retentionDays: 30 },
		});
		expect(status).toBe(201);
		expect(JSON.parse(h.admin.last("POST", "/api/s3/buckets")?.body ?? "")).toEqual({
			name: "media-2026",
			owner: "ci-bot",
			quota_enabled: true,
			quota_size: 5 * 1024 ** 3,
			quota_unit: "B",
			versioning_enabled: true,
			object_lock_enabled: true,
			object_lock_mode: "COMPLIANCE",
			set_default_retention: true,
			object_lock_duration: 30,
		});
	});

	test("creates a plain bucket with defaults", async () => {
		await h.json("POST", "/buckets", { name: "plain" });
		expect(JSON.parse(h.admin.last("POST", "/api/s3/buckets")?.body ?? "")).toMatchObject({
			quota_enabled: false,
			quota_size: 0,
			object_lock_enabled: false,
			object_lock_mode: "",
			set_default_retention: false,
			object_lock_duration: 0,
		});
	});

	test("object lock needs versioning; names follow S3 rules", async () => {
		const lock = await h.json("POST", "/buckets", {
			name: "locked",
			objectLock: { mode: "GOVERNANCE", retentionDays: null },
		});
		expect(lock.status).toBe(400);
		expect(lock.body.error).toBe("objectLock: Object lock needs versioning");
		for (const name of ["ab", "a..b", "192.168.1.1", "-dash"]) {
			expect((await h.json("POST", "/buckets", { name })).status).toBe(400);
		}
	});

	test("an existing bucket is a conflict with a plain message", async () => {
		h.admin.on("POST /api/s3/buckets", () =>
			Response.json({ error: "Failed to create bucket: bucket media already exists" }, { status: 500 }),
		);
		const { status, body } = await h.json("POST", "/buckets", { name: "media" });
		expect(status).toBe(409);
		expect(body).toEqual({ error: "Bucket media already exists", upstream: "admin" });
	});

	test("surfaces other SeaweedFS errors", async () => {
		h.admin.on("POST /api/s3/buckets", () =>
			Response.json({ error: "Failed to create bucket: filer unavailable" }, { status: 500 }),
		);
		const { status, body } = await h.json("POST", "/buckets", { name: "media" });
		expect(status).toBe(500);
		expect(body).toEqual({ error: "Failed to create bucket: filer unavailable", upstream: "admin" });
	});

	test("deletes a bucket", async () => {
		expect((await h.json("DELETE", "/buckets/archive")).status).toBe(200);
		expect(h.admin.last("DELETE", "/api/s3/buckets/archive")).toBeTruthy();
	});

	test("updates quota in bytes and clears it", async () => {
		await h.json("PUT", "/buckets/archive/quota", { enabled: true, bytes: 2048 });
		expect(JSON.parse(h.admin.last("PUT", "/api/s3/buckets/archive/quota")?.body ?? "")).toEqual({
			quota_enabled: true,
			quota_size: 2048,
			quota_unit: "B",
		});
		await h.json("PUT", "/buckets/archive/quota", { enabled: false, bytes: 999 });
		expect(JSON.parse(h.admin.last("PUT", "/api/s3/buckets/archive/quota")?.body ?? "")).toMatchObject({
			quota_enabled: false,
			quota_size: 0,
		});
		expect((await h.json("PUT", "/buckets/archive/quota", { enabled: true, bytes: 0 })).status).toBe(400);
	});

	test("sets and clears the owner", async () => {
		await h.json("PUT", "/buckets/archive/owner", { owner: "" });
		expect(JSON.parse(h.admin.last("PUT", "/api/s3/buckets/archive/owner")?.body ?? "")).toEqual({
			owner: "",
		});
	});
});

describe("lifecycle", () => {
	test("reads rules in Kelp's shape", async () => {
		const { body } = await h.json("GET", "/buckets/archive/lifecycle");
		expect(body.rules).toEqual([
			{ ...rule },
			{
				...rule,
				id: "",
				enabled: false,
				prefix: "",
				tags: {},
				expirationDays: null,
				abortMultipartDays: 3,
			},
		]);
	});

	test("saves rules in SeaweedFS's shape, omitting empty fields", async () => {
		const { status } = await h.json("PUT", "/buckets/archive/lifecycle", {
			rules: [
				rule,
				{ ...rule, id: "", prefix: "", tags: {}, expirationDays: null, expirationDate: "2027-01-01" },
			],
		});
		expect(status).toBe(200);
		expect(JSON.parse(h.admin.last("PUT", "/api/s3/buckets/archive/lifecycle")?.body ?? "")).toEqual({
			rules: [
				{ id: "logs", status: "Enabled", prefix: "logs/", tags: { env: "dev" }, expiration_days: 30 },
				{ status: "Enabled", expiration_date: "2027-01-01" },
			],
		});
	});

	test("an empty rule list removes the configuration", async () => {
		await h.json("PUT", "/buckets/archive/lifecycle", { rules: [] });
		expect(h.admin.last("DELETE", "/api/s3/buckets/archive/lifecycle")).toBeTruthy();
	});

	test("validates rules the way SeaweedFS does", async () => {
		const cases: Array<[Record<string, unknown>, string]> = [
			[{ expirationDays: null }, "Choose at least one action"],
			[{ expirationDate: "2027-01-01" }, "not both"],
			[{ expiredDeleteMarkers: true }, "cannot be combined"],
			[{ sizeGreaterThan: 10, sizeLessThan: 5 }, "smaller than the maximum"],
			[{ tags: { env: " " } }, "Tag values cannot be empty"],
		];
		for (const [change, message] of cases) {
			const { status, body } = await h.json("PUT", "/buckets/archive/lifecycle", {
				rules: [{ ...rule, ...change }],
			});
			expect(status).toBe(400);
			expect(body.error).toContain(message);
		}
		const duplicate = await h.json("PUT", "/buckets/archive/lifecycle", { rules: [rule, rule] });
		expect(duplicate.body.error).toContain("different name");
	});
});

describe("policy", () => {
	test("reads, saves and removes the policy", async () => {
		const { body } = await h.json("GET", "/buckets/archive/policy");
		expect(body.policy.Statement[0].Effect).toBe("Allow");
		expect(body.invalidText).toBeNull();

		const document = {
			Version: "2012-10-17",
			Statement: [{ Effect: "Deny", Principal: "*", Action: "s3:*" }],
		};
		await h.json("PUT", "/buckets/archive/policy", { policy: document });
		expect(JSON.parse(h.admin.last("PUT", "/api/s3/buckets/archive/policy")?.body ?? "")).toEqual({
			policy: document,
		});

		await h.json("DELETE", "/buckets/archive/policy");
		expect(h.admin.last("DELETE", "/api/s3/buckets/archive/policy")).toBeTruthy();
	});

	test("hands back stored text SeaweedFS cannot parse", async () => {
		h.admin.on("GET /api/s3/buckets/archive/policy", {
			bucket: "archive",
			policy: null,
			policy_text: "{broken",
		});
		const { body } = await h.json("GET", "/buckets/archive/policy");
		expect(body).toEqual({ policy: null, invalidText: "{broken" });
	});

	test("passes SeaweedFS validation errors through as 400s", async () => {
		h.admin.on("PUT /api/s3/buckets/archive/policy", () =>
			Response.json({ error: "Failed to update bucket policy: invalid effect: Maybe" }, { status: 400 }),
		);
		const { status, body } = await h.json("PUT", "/buckets/archive/policy", { policy: { Statement: [] } });
		expect(status).toBe(400);
		expect(body.error).toContain("invalid effect");
	});
});

test("viewers can read buckets but not change them", async () => {
	const viewer = await harness({ role: "viewer" });
	viewer.admin.fixture("GET /api/s3/buckets", "admin/buckets-all");
	viewer.master.fixture("GET /vol/status", "master/vol-status");
	expect((await viewer.get("/buckets")).status).toBe(200);
	expect((await viewer.json("POST", "/buckets", { name: "nope" })).status).toBe(403);
	expect(viewer.admin.requests.some((r) => r.method === "POST")).toBe(false);
	await viewer.stop();
});
