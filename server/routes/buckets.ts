import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../app.ts";
import {
	collectionStats,
	mapBucket,
	mapLifecycleRule,
	mapPolicy,
	toAdminLifecycleRule,
} from "../map/objects.ts";
import { list, obj, type Raw, str } from "../map/raw.ts";
import type { Services } from "../services.ts";
import { UpstreamError } from "../upstream/http.ts";

/** S3 bucket naming rules: 3-63 lowercase letters, digits, dots and hyphens, starting and ending alphanumeric. */
export const bucketName = z
	.string()
	.trim()
	.regex(
		/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/,
		"Use 3-63 lowercase letters, numbers, dots or hyphens, starting and ending with a letter or number",
	)
	.refine((name) => !name.includes(".."), "Bucket names cannot contain two dots in a row")
	.refine((name) => !/^\d+\.\d+\.\d+\.\d+$/.test(name), "Bucket names cannot look like an IP address");

const owner = z.string().trim().max(256, "Owner names are at most 256 characters");
const days = z.number().int().positive();

const createBucket = z
	.object({
		name: bucketName,
		owner: owner.default(""),
		quotaBytes: z.number().int().positive().nullable().default(null),
		versioning: z.boolean().default(false),
		objectLock: z
			.object({ mode: z.enum(["GOVERNANCE", "COMPLIANCE"]), retentionDays: days.nullable() })
			.nullable()
			.default(null),
	})
	.refine((bucket) => !bucket.objectLock || bucket.versioning, {
		message: "Object lock needs versioning",
		path: ["objectLock"],
	});

const quota = z
	.object({ enabled: z.boolean(), bytes: z.number().int().nonnegative() })
	.refine((q) => !q.enabled || q.bytes > 0, {
		message: "Set a quota above zero, or turn the quota off",
		path: ["bytes"],
	});

const nullableCount = z.number().int().positive().nullable();
const lifecycleRule = z
	.object({
		id: z.string().trim().max(255, "Rule names are at most 255 characters"),
		enabled: z.boolean(),
		prefix: z.string(),
		tags: z.record(
			z.string().trim().min(1, "Tag keys cannot be empty"),
			z.string().trim().min(1, "Tag values cannot be empty"),
		),
		sizeGreaterThan: nullableCount,
		sizeLessThan: nullableCount,
		expirationDays: nullableCount,
		expirationDate: z.iso.date().nullable(),
		expiredDeleteMarkers: z.boolean(),
		noncurrentExpirationDays: nullableCount,
		newerNoncurrentVersions: nullableCount,
		abortMultipartDays: nullableCount,
	})
	.refine((r) => !(r.expirationDays && r.expirationDate), {
		message: "Expire after a number of days or on a date, not both",
		path: ["expirationDate"],
	})
	.refine((r) => !(r.expiredDeleteMarkers && (r.expirationDays || r.expirationDate)), {
		message: "Removing expired delete markers cannot be combined with an expiration",
		path: ["expiredDeleteMarkers"],
	})
	.refine((r) => !(r.sizeGreaterThan && r.sizeLessThan && r.sizeGreaterThan >= r.sizeLessThan), {
		message: "The minimum size must be smaller than the maximum size",
		path: ["sizeLessThan"],
	})
	.refine(
		(r) =>
			Boolean(
				r.expirationDays ||
					r.expirationDate ||
					r.expiredDeleteMarkers ||
					r.noncurrentExpirationDays ||
					r.newerNoncurrentVersions ||
					r.abortMultipartDays,
			),
		{ message: "Choose at least one action for the rule", path: ["expirationDays"] },
	);
const lifecycle = z
	.object({ rules: z.array(lifecycleRule).max(1000, "A bucket can have at most 1000 lifecycle rules") })
	.refine(
		(l) => new Set(l.rules.map((r) => r.id).filter(Boolean)).size === l.rules.filter((r) => r.id).length,
		{
			message: "Each rule needs a different name",
			path: ["rules"],
		},
	);

const policy = z.object({ policy: z.record(z.string(), z.unknown()) });

export function bucketsRoutes({ admin, master }: Services) {
	const path = (name: string, suffix = "") =>
		`s3/buckets/${encodeURIComponent(bucketName.parse(name))}${suffix}`;

	/** Collection stats are a nicety; a master hiccup should not hide the bucket list. */
	async function stats() {
		try {
			return collectionStats(await master.json("vol/status"));
		} catch {
			return new Map();
		}
	}

	return (
		new Hono<Env>()
			.get("/buckets", async (c) => {
				const [raw, collections] = await Promise.all([admin.json<Raw>("s3/buckets"), stats()]);
				const buckets = list(raw.buckets).map((b) => mapBucket(b, collections.get(str(b.name))));
				return c.json({ buckets });
			})
			.post("/buckets", async (c) => {
				const input = createBucket.parse(await c.req.json());
				await admin
					.json("s3/buckets", {
						method: "POST",
						body: {
							name: input.name,
							owner: input.owner,
							quota_enabled: input.quotaBytes !== null,
							quota_size: input.quotaBytes ?? 0,
							quota_unit: "B",
							versioning_enabled: input.versioning,
							object_lock_enabled: input.objectLock !== null,
							object_lock_mode: input.objectLock?.mode ?? "",
							set_default_retention: Boolean(input.objectLock?.retentionDays),
							object_lock_duration: input.objectLock?.retentionDays ?? 0,
						},
					})
					.catch((error: unknown) => {
						if (error instanceof UpstreamError && /already exists/i.test(error.message)) {
							throw new UpstreamError(error.upstream, 409, `Bucket ${input.name} already exists`);
						}
						throw error;
					});
				return c.json({ name: input.name }, 201);
			})
			/** Names of S3 identities that can own a bucket. Never includes credentials. */
			.get("/bucket-owners", async (c) => {
				const raw = await admin.json<Raw>("users");
				const owners = list(raw.users)
					.map((u) => str(u.username))
					.filter(Boolean)
					.sort();
				return c.json({ owners });
			})
			.get("/buckets/:name", async (c) => {
				const [raw, collections] = await Promise.all([admin.json<Raw>(path(c.req.param("name"))), stats()]);
				const bucket = obj(raw.bucket);
				return c.json({ bucket: mapBucket(bucket, collections.get(str(bucket.name))) });
			})
			.delete("/buckets/:name", async (c) => {
				await admin.json(path(c.req.param("name")), { method: "DELETE" });
				return c.json({ ok: true });
			})
			.put("/buckets/:name/quota", async (c) => {
				const input = quota.parse(await c.req.json());
				await admin.json(path(c.req.param("name"), "/quota"), {
					method: "PUT",
					body: {
						quota_enabled: input.enabled,
						quota_size: input.enabled ? input.bytes : 0,
						quota_unit: "B",
					},
				});
				return c.json({ ok: true });
			})
			.put("/buckets/:name/owner", async (c) => {
				const input = z.object({ owner }).parse(await c.req.json());
				await admin.json(path(c.req.param("name"), "/owner"), {
					method: "PUT",
					body: { owner: input.owner },
				});
				return c.json({ ok: true });
			})
			.get("/buckets/:name/lifecycle", async (c) => {
				const raw = await admin.json<Raw>(path(c.req.param("name"), "/lifecycle"));
				return c.json({ rules: list(raw.rules).map(mapLifecycleRule) });
			})
			.put("/buckets/:name/lifecycle", async (c) => {
				const input = lifecycle.parse(await c.req.json());
				const target = path(c.req.param("name"), "/lifecycle");
				if (input.rules.length === 0) await admin.json(target, { method: "DELETE" });
				else
					await admin.json(target, { method: "PUT", body: { rules: input.rules.map(toAdminLifecycleRule) } });
				return c.json({ ok: true });
			})
			.get("/buckets/:name/policy", async (c) => {
				return c.json(mapPolicy(await admin.json<Raw>(path(c.req.param("name"), "/policy"))));
			})
			.put("/buckets/:name/policy", async (c) => {
				const input = policy.parse(await c.req.json());
				await admin.json(path(c.req.param("name"), "/policy"), {
					method: "PUT",
					body: { policy: input.policy },
				});
				return c.json({ ok: true });
			})
			.delete("/buckets/:name/policy", async (c) => {
				await admin.json(path(c.req.param("name"), "/policy"), { method: "DELETE" });
				return c.json({ ok: true });
			})
	);
}
