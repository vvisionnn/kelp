import { Hono } from "hono";
import { z } from "zod";
import type { TableBucket, TableBucketDetail, TableDetail } from "../../shared/tables.ts";
import type { Env } from "../app.ts";
import { mapIcebergMetadata, parseIcebergJson } from "../iceberg/metadata.ts";
import { previewTable } from "../iceberg/preview.ts";
import { list, num, obj, type Raw, str } from "../map/raw.ts";
import {
	type CatalogRecord,
	catalogOnlyTable,
	catalogRecord,
	mapNamespace,
	mapTableBucket,
	mapTableSummary,
} from "../map/tables.ts";
import type { Services } from "../services.ts";
import { UpstreamError } from "../upstream/http.ts";

const bucketName = z
	.string()
	.trim()
	.regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/, "Use 3-63 lowercase letters, digits and hyphens");
const identifier = (what: string) =>
	z
		.string()
		.trim()
		.regex(/^[a-z0-9_]{1,255}$/, `${what} can use lowercase letters, digits and underscores`);
const namespaceName = z
	.string()
	.trim()
	.regex(
		/^[a-z0-9_]{1,255}(\.[a-z0-9_]{1,255})*$/,
		"Use lowercase letters, digits and underscores; dots nest namespaces",
	);
const tags = z
	.record(z.string().trim().min(1).max(128), z.string().max(256))
	.refine((t) => Object.keys(t).length <= 50, "Use at most 50 tags");
const policy = z.object({
	policy: z.string().superRefine((text, ctx) => {
		try {
			const parsed = JSON.parse(text);
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
				ctx.addIssue({ code: "custom", message: "A policy must be a JSON object" });
			}
		} catch (error) {
			ctx.addIssue({ code: "custom", message: `Policy is not valid JSON: ${(error as Error).message}` });
		}
	}),
});
const ICEBERG_TYPE =
	/^(boolean|int|long|float|double|date|time|timestamp|timestamptz|string|uuid|binary|decimal\(\d{1,2},\s*\d{1,2}\)|fixed\[\d+\])$/;
const createTable = z.object({
	name: identifier("Table name"),
	fields: z
		.array(
			z.object({
				name: z.string().trim().min(1, "Name every column").max(255),
				type: z.string().trim().regex(ICEBERG_TYPE, "Pick an Iceberg type"),
				required: z.boolean(),
			}),
		)
		.min(1, "Add at least one column")
		.refine(
			(fields) => new Set(fields.map((f) => f.name)).size === fields.length,
			"Column names must be unique",
		),
});

/** Filer paths with each segment URL-encoded. */
const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

/** S3 Tables errors read "NoSuchBucket: table bucket x not found"; keep the sentence. */
export function readableError(error: unknown): never {
	if (error instanceof UpstreamError) {
		const match = /^[A-Z][A-Za-z]+: (.+)$/.exec(error.message);
		if (match?.[1]) {
			throw new UpstreamError(
				error.upstream,
				error.status,
				match[1].charAt(0).toUpperCase() + match[1].slice(1),
			);
		}
	}
	throw error;
}

export function tablesRoutes({ admin: upstream, filer }: Services) {
	const s3t = (path: string) => `s3tables/${path}`;
	const admin = {
		json: <T = unknown>(path: string, options?: Parameters<typeof upstream.json>[1]) =>
			upstream.json<T>(path, options).catch(readableError),
	};

	async function buckets(): Promise<{ buckets: TableBucket[]; icebergPort: number | null }> {
		const raw = await admin.json<Raw>(s3t("buckets"));
		return {
			buckets: list(raw.buckets).map(mapTableBucket),
			icebergPort: num(raw.iceberg_port) || null,
		};
	}

	async function bucketArn(name: string): Promise<string> {
		const found = (await buckets()).buckets.find((b) => b.name === name);
		if (!found) throw new UpstreamError("admin", 404, `Table bucket ${name} does not exist`);
		return found.arn;
	}

	async function getTags(arn: string): Promise<Record<string, string>> {
		const raw = await admin.json<Raw>(s3t("tags"), { query: { arn } });
		return Object.fromEntries(Object.entries(obj(raw.tags)).map(([k, v]) => [k, String(v)]));
	}

	/** Replaces a resource's tags: removes keys that are gone, then writes the rest. */
	async function setTags(arn: string, next: Record<string, string>) {
		const removed = Object.keys(await getTags(arn)).filter((key) => !(key in next));
		if (removed.length) {
			await admin.json(s3t("tags"), { method: "DELETE", body: { resource_arn: arn, tag_keys: removed } });
		}
		if (Object.keys(next).length) {
			await admin.json(s3t("tags"), { method: "PUT", body: { resource_arn: arn, tags: next } });
		}
	}

	const readFile = async (path: string, range?: { start: number; end: number }) => {
		const response = await filer.raw(
			encodePath(path),
			range ? { headers: { range: `bytes=${range.start}-${range.end}` } } : {},
		);
		return new Uint8Array(await response.arrayBuffer());
	};

	async function tableContext(bucket: string, namespace: string, table: string) {
		const arn = await bucketArn(bucket);
		const listing = await admin.json<Raw>(s3t("tables"), { query: { bucket: arn, namespace } });
		const summary = list(listing.tables)
			.map(mapTableSummary)
			.find((t) => t.name === table);
		if (!summary)
			throw new UpstreamError("admin", 404, `Table ${namespace}.${table} does not exist in ${bucket}`);
		const entry = await filer.json<Raw>(encodePath(`/buckets/${bucket}/${namespace}/${table}`), {
			query: { metadata: "true" },
			headers: { accept: "application/json" },
		});
		return { arn, summary, record: catalogRecord(entry) };
	}

	/** Iceberg metadata: the current metadata file, else the catalog's embedded copy or schema. */
	async function icebergFor(record: CatalogRecord, metadataLocation: string | null) {
		const location = metadataLocation ?? record.metadataLocation;
		if (location) {
			const match = /^s3a?:\/\/([^/]+)(\/.*)$/.exec(location);
			if (!match)
				return { iceberg: null, error: `Kelp cannot read metadata stored outside SeaweedFS (${location})` };
			try {
				const text = new TextDecoder().decode(await readFile(`/buckets/${match[1]}${match[2]}`));
				return { iceberg: mapIcebergMetadata(parseIcebergJson(text)), error: null };
			} catch (error) {
				if (record.fullMetadata) return { iceberg: mapIcebergMetadata(record.fullMetadata), error: null };
				return { iceberg: null, error: `Could not read table metadata: ${(error as Error).message}` };
			}
		}
		if (record.fullMetadata) return { iceberg: mapIcebergMetadata(record.fullMetadata), error: null };
		return { iceberg: catalogOnlyTable(record.simpleFields), error: null };
	}

	const tablePath = "/tables/buckets/:bucket/namespaces/:namespace/tables/:table";

	return new Hono<Env>()
		.get("/tables/buckets", async (c) => c.json(await buckets()))
		.post("/tables/buckets", async (c) => {
			const input = z
				.object({ name: bucketName, owner: z.string().trim().max(128).optional(), tags: tags.optional() })
				.parse(await c.req.json());
			const created = await admin.json<Raw>(s3t("buckets"), {
				method: "POST",
				body: { name: input.name, owner: input.owner ?? "", tags: input.tags ?? {} },
			});
			return c.json({ name: input.name, arn: str(obj(created).arn) }, 201);
		})
		.get("/tables/buckets/:bucket", async (c) => {
			const name = c.req.param("bucket");
			const all = await buckets();
			const bucket = all.buckets.find((b) => b.name === name);
			if (!bucket) throw new UpstreamError("admin", 404, `Table bucket ${name} does not exist`);
			const [namespaces, tables, bucketTags, bucketPolicy] = await Promise.all([
				admin.json<Raw>(s3t("namespaces"), { query: { bucket: bucket.arn } }),
				admin.json<Raw>(s3t("tables"), { query: { bucket: bucket.arn } }),
				getTags(bucket.arn),
				admin.json<Raw>(s3t("bucket-policy"), { query: { bucket: bucket.arn } }),
			]);
			return c.json({
				bucket,
				namespaces: list(namespaces.namespaces).map(mapNamespace),
				tables: list(tables.tables).map(mapTableSummary),
				tags: bucketTags,
				policy: str(bucketPolicy.policy),
			} satisfies TableBucketDetail);
		})
		.delete("/tables/buckets/:bucket", async (c) => {
			const arn = await bucketArn(c.req.param("bucket"));
			await admin.json(s3t("buckets"), { method: "DELETE", query: { bucket: arn } });
			return c.json({ ok: true });
		})
		.put("/tables/buckets/:bucket/policy", async (c) => {
			const input = policy.parse(await c.req.json());
			const arn = await bucketArn(c.req.param("bucket"));
			await admin.json(s3t("bucket-policy"), {
				method: "PUT",
				body: { bucket_arn: arn, policy: input.policy },
			});
			return c.json({ ok: true });
		})
		.delete("/tables/buckets/:bucket/policy", async (c) => {
			const arn = await bucketArn(c.req.param("bucket"));
			await admin.json(s3t("bucket-policy"), { method: "DELETE", query: { bucket: arn } });
			return c.json({ ok: true });
		})
		.put("/tables/buckets/:bucket/tags", async (c) => {
			const input = z.object({ tags }).parse(await c.req.json());
			await setTags(await bucketArn(c.req.param("bucket")), input.tags);
			return c.json({ ok: true });
		})
		.post("/tables/buckets/:bucket/namespaces", async (c) => {
			const input = z.object({ name: namespaceName }).parse(await c.req.json());
			const arn = await bucketArn(c.req.param("bucket"));
			await admin.json(s3t("namespaces"), { method: "POST", body: { bucket_arn: arn, name: input.name } });
			return c.json({ name: input.name }, 201);
		})
		.delete("/tables/buckets/:bucket/namespaces/:namespace", async (c) => {
			const arn = await bucketArn(c.req.param("bucket"));
			await admin.json(s3t("namespaces"), {
				method: "DELETE",
				query: { bucket: arn, name: c.req.param("namespace") },
			});
			return c.json({ ok: true });
		})
		.post("/tables/buckets/:bucket/namespaces/:namespace/tables", async (c) => {
			const input = createTable.parse(await c.req.json());
			const arn = await bucketArn(c.req.param("bucket"));
			const created = await admin.json<Raw>(s3t("tables"), {
				method: "POST",
				body: {
					bucket_arn: arn,
					namespace: c.req.param("namespace"),
					name: input.name,
					format: "ICEBERG",
					metadata: { iceberg: { schema: { fields: input.fields } } },
				},
			});
			return c.json({ name: input.name, arn: str(obj(created).table_arn) }, 201);
		})
		.get(tablePath, async (c) => {
			const { bucket, namespace, table } = c.req.param();
			const { arn, summary, record } = await tableContext(bucket, namespace, table);
			const [tableTags, tablePolicy, metadata] = await Promise.all([
				getTags(summary.arn),
				admin.json<Raw>(s3t("table-policy"), { query: { bucket: arn, namespace, name: table } }),
				icebergFor(record, summary.metadataLocation),
			]);
			return c.json({
				table: summary,
				bucket,
				owner: record.owner,
				versionToken: record.versionToken,
				tags: tableTags,
				policy: str(tablePolicy.policy),
				iceberg: metadata.iceberg,
				metadataError: metadata.error,
			} satisfies TableDetail);
		})
		.delete(tablePath, async (c) => {
			const { bucket, namespace, table } = c.req.param();
			const arn = await bucketArn(bucket);
			await admin.json(s3t("tables"), { method: "DELETE", query: { bucket: arn, namespace, name: table } });
			return c.json({ ok: true });
		})
		.put(`${tablePath}/policy`, async (c) => {
			const { bucket, namespace, table } = c.req.param();
			const input = policy.parse(await c.req.json());
			const arn = await bucketArn(bucket);
			await admin.json(s3t("table-policy"), {
				method: "PUT",
				body: { bucket_arn: arn, namespace, name: table, policy: input.policy },
			});
			return c.json({ ok: true });
		})
		.delete(`${tablePath}/policy`, async (c) => {
			const { bucket, namespace, table } = c.req.param();
			const arn = await bucketArn(bucket);
			await admin.json(s3t("table-policy"), {
				method: "DELETE",
				query: { bucket: arn, namespace, name: table },
			});
			return c.json({ ok: true });
		})
		.put(`${tablePath}/tags`, async (c) => {
			const { bucket, namespace, table } = c.req.param();
			const input = z.object({ tags }).parse(await c.req.json());
			const { summary } = await tableContext(bucket, namespace, table);
			await setTags(summary.arn, input.tags);
			return c.json({ ok: true });
		})
		.get(`${tablePath}/preview`, async (c) => {
			const { bucket, namespace, table } = c.req.param();
			const query = z
				.object({
					snapshot: z
						.string()
						.regex(/^-?\d+$/)
						.optional(),
					file: z.string().optional(),
					limit: z.coerce.number().int().min(1).max(200).default(50),
				})
				.parse(c.req.query());
			const { summary, record } = await tableContext(bucket, namespace, table);
			const { iceberg, error } = await icebergFor(record, summary.metadataLocation);
			if (!iceberg) throw new UpstreamError("filer", 422, error ?? "This table has no data yet.");
			try {
				return c.json(
					await previewTable({ read: readFile }, iceberg, {
						snapshotId: query.snapshot,
						file: query.file,
						limit: query.limit,
					}),
				);
			} catch (error) {
				if (error instanceof UpstreamError) throw error;
				throw new UpstreamError(
					"filer",
					422,
					`Could not read the table's files: ${(error as Error).message}`,
				);
			}
		});
}
