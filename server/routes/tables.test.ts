import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { RecordedRequest } from "../../test/fake-upstream.ts";
import { type Harness, harness } from "../../test/harness.ts";
import { ANALYTICS_ARN, ORDERS_ARN, useAnalyticsFixtures } from "../../test/tables-fakes.ts";

let h: Harness;
beforeEach(async () => {
	h = await harness();
	useAnalyticsFixtures(h);
});
afterEach(() => h.stop());

const ORDERS = "/tables/buckets/analytics/namespaces/sales/tables/orders";
const POLICY = JSON.stringify({
	Version: "2012-10-17",
	Statement: [{ Effect: "Allow", Principal: "*", Action: "s3tables:GetTable", Resource: "*" }],
});
const body = (method: string, path: string) => JSON.parse(h.admin.last(method, path)?.body || "null");

describe("table buckets", () => {
	test("lists buckets with the catalog port", async () => {
		const { body } = await h.json("GET", "/tables/buckets");
		expect(body.icebergPort).toBe(8181);
		expect(body.buckets[0]).toMatchObject({
			name: "analytics",
			arn: ANALYTICS_ARN,
			owner: "kelp-dev",
			format: "ICEBERG",
			policyStatements: 1,
		});
	});

	test("bucket detail gathers namespaces, tables, tags and policy", async () => {
		const { status, body } = await h.json("GET", "/tables/buckets/analytics");
		expect(status).toBe(200);
		expect(body.namespaces.map((n: { name: string }) => n.name)).toContain("sales");
		expect(body.tables.map((t: { name: string }) => t.name)).toEqual(["invoices", "orders", "page_views"]);
		expect(body.tables[0].metadataLocation).toBeNull();
		expect(body.tags).toEqual({ team: "data" });
		expect(JSON.parse(body.policy).Statement).toHaveLength(1);
	});

	test("unknown buckets are 404s", async () => {
		const { status, body } = await h.json("GET", "/tables/buckets/nope");
		expect(status).toBe(404);
		expect(body.error).toBe("Table bucket nope does not exist");
		expect((await h.json("DELETE", "/tables/buckets/nope")).status).toBe(404);
	});

	test("creates a bucket with owner and tags", async () => {
		h.admin.on("POST /api/s3tables/buckets", () => Response.json({ arn: "arn:x" }, { status: 201 }));
		const { status, body: created } = await h.json("POST", "/tables/buckets", {
			name: "lake",
			owner: "ana",
			tags: { env: "prod" },
		});
		expect(status).toBe(201);
		expect(created).toEqual({ name: "lake", arn: "arn:x" });
		expect(body("POST", "/api/s3tables/buckets")).toEqual({
			name: "lake",
			owner: "ana",
			tags: { env: "prod" },
		});
		await h.json("POST", "/tables/buckets", { name: "lake2" });
		expect(body("POST", "/api/s3tables/buckets")).toEqual({ name: "lake2", owner: "", tags: {} });
	});

	test("explains SeaweedFS errors in plain words", async () => {
		h.admin.on("POST /api/s3tables/buckets", () =>
			Response.json({ error: "BucketAlreadyExists: table bucket lake already exists" }, { status: 409 }),
		);
		const { status, body } = await h.json("POST", "/tables/buckets", { name: "lake" });
		expect(status).toBe(409);
		expect(body.error).toBe("Table bucket lake already exists");
		h.admin.on("POST /api/s3tables/buckets", () => Response.json({ error: "disk full" }, { status: 500 }));
		expect((await h.json("POST", "/tables/buckets", { name: "lake" })).body.error).toBe("disk full");
	});

	test("validates bucket names and tags", async () => {
		expect((await h.json("POST", "/tables/buckets", { name: "Bad_Name" })).body.error).toBe(
			"name: Use 3-63 lowercase letters, digits and hyphens",
		);
		const many = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`k${i}`, "v"]));
		expect((await h.json("POST", "/tables/buckets", { name: "lake", tags: many })).body.error).toBe(
			"tags: Use at most 50 tags",
		);
	});

	test("deletes a bucket by ARN", async () => {
		h.admin.on("DELETE /api/s3tables/buckets", { message: "Bucket deleted" });
		expect((await h.json("DELETE", "/tables/buckets/analytics")).body).toEqual({ ok: true });
		expect(h.admin.last("DELETE", "/api/s3tables/buckets")?.query.bucket).toBe(ANALYTICS_ARN);
	});

	test("sets and removes the bucket policy", async () => {
		h.admin.on("PUT /api/s3tables/bucket-policy", { message: "ok" });
		h.admin.on("DELETE /api/s3tables/bucket-policy", { message: "ok" });
		expect((await h.json("PUT", "/tables/buckets/analytics/policy", { policy: POLICY })).status).toBe(200);
		expect(body("PUT", "/api/s3tables/bucket-policy")).toEqual({ bucket_arn: ANALYTICS_ARN, policy: POLICY });
		expect((await h.json("DELETE", "/tables/buckets/analytics/policy")).status).toBe(200);
	});

	test("rejects policies that are not JSON objects", async () => {
		expect(
			(await h.json("PUT", "/tables/buckets/analytics/policy", { policy: "{nope" })).body.error,
		).toStartWith("policy: Policy is not valid JSON");
		expect((await h.json("PUT", "/tables/buckets/analytics/policy", { policy: "[1]" })).body.error).toBe(
			"policy: A policy must be a JSON object",
		);
	});

	test("replaces tags: removes dropped keys, then writes the rest", async () => {
		h.admin.on("PUT /api/s3tables/tags", { message: "ok" });
		h.admin.on("DELETE /api/s3tables/tags", { message: "ok" });
		await h.json("PUT", "/tables/buckets/analytics/tags", { tags: { env: "prod" } });
		expect(body("DELETE", "/api/s3tables/tags")).toEqual({ resource_arn: ANALYTICS_ARN, tag_keys: ["team"] });
		expect(body("PUT", "/api/s3tables/tags")).toEqual({ resource_arn: ANALYTICS_ARN, tags: { env: "prod" } });

		const before = h.admin.requests.length;
		await h.json("PUT", "/tables/buckets/analytics/tags", { tags: { team: "data" } });
		expect(h.admin.requests.slice(before).some((r) => r.method === "DELETE")).toBe(false);

		await h.json("PUT", "/tables/buckets/analytics/tags", { tags: {} });
		expect(h.admin.requests.at(-1)?.method).toBe("DELETE");
	});
});

describe("namespaces and tables", () => {
	test("creates and deletes namespaces, including nested ones", async () => {
		h.admin.on("POST /api/s3tables/namespaces", () =>
			Response.json({ namespace: ["emea", "retail"] }, { status: 201 }),
		);
		h.admin.on("DELETE /api/s3tables/namespaces", { message: "ok" });
		expect(
			(await h.json("POST", "/tables/buckets/analytics/namespaces", { name: "emea.retail" })).status,
		).toBe(201);
		expect(body("POST", "/api/s3tables/namespaces")).toEqual({
			bucket_arn: ANALYTICS_ARN,
			name: "emea.retail",
		});
		expect((await h.json("POST", "/tables/buckets/analytics/namespaces", { name: "Bad Name" })).status).toBe(
			400,
		);
		await h.json("DELETE", "/tables/buckets/analytics/namespaces/emea.retail");
		expect(h.admin.last("DELETE", "/api/s3tables/namespaces")?.query).toEqual({
			bucket: ANALYTICS_ARN,
			name: "emea.retail",
		});
	});

	test("creates a table with its schema", async () => {
		h.admin.on("POST /api/s3tables/tables", () =>
			Response.json({ table_arn: "arn:t", version_token: "v" }, { status: 201 }),
		);
		const fields = [
			{ name: "id", type: "long", required: true },
			{ name: "amount", type: "decimal(10,2)", required: false },
		];
		const { status, body: created } = await h.json(
			"POST",
			"/tables/buckets/analytics/namespaces/sales/tables",
			{ name: "refunds", fields },
		);
		expect(status).toBe(201);
		expect(created).toEqual({ name: "refunds", arn: "arn:t" });
		expect(body("POST", "/api/s3tables/tables")).toEqual({
			bucket_arn: ANALYTICS_ARN,
			namespace: "sales",
			name: "refunds",
			format: "ICEBERG",
			metadata: { iceberg: { schema: { fields } } },
		});
	});

	test("validates table definitions", async () => {
		const create = (input: unknown) =>
			h.json("POST", "/tables/buckets/analytics/namespaces/sales/tables", input);
		expect((await create({ name: "t", fields: [] })).body.error).toBe("fields: Add at least one column");
		expect(
			(await create({ name: "t", fields: [{ name: "a", type: "varchar", required: true }] })).body.error,
		).toBe("fields.0.type: Pick an Iceberg type");
		expect(
			(
				await create({
					name: "t",
					fields: [
						{ name: "a", type: "int", required: true },
						{ name: "a", type: "int", required: false },
					],
				})
			).body.error,
		).toBe("fields: Column names must be unique");
	});

	test("table detail reads the current Iceberg metadata file", async () => {
		const { status, body } = await h.json("GET", ORDERS);
		expect(status).toBe(200);
		expect(body.table).toMatchObject({ name: "orders", arn: ORDERS_ARN, namespace: "sales" });
		expect(body.owner).toBe("kelp-dev");
		expect(body.versionToken).toBeString();
		expect(body.tags).toEqual({ owner: "sales-ops", pii: "false" });
		expect(JSON.parse(body.policy).Version).toBe("2012-10-17");
		expect(body.iceberg.currentSnapshotId).toBe("1000003");
		expect(body.iceberg.metrics.records).toBe(510);
		expect(body.metadataError).toBeNull();
	});

	test("tables created without metadata show their catalog schema", async () => {
		const { body } = await h.json("GET", "/tables/buckets/analytics/namespaces/finance/tables/invoices");
		expect(body.iceberg.fields.map((f: { name: string }) => f.name)).toEqual([
			"invoice_id",
			"customer",
			"total",
			"due_on",
		]);
		expect(body.iceberg.snapshots).toEqual([]);
		expect(body.policy).toBe("");
	});

	test("falls back to the catalog's copy when the metadata file is unreadable", async () => {
		const { body } = await h.json("GET", "/tables/buckets/analytics/namespaces/web/tables/page_views");
		expect(body.iceberg.fields.map((f: { name: string }) => f.name)).toContain("path");
		expect(body.metadataError).toBeNull();
	});

	test("reports unreadable metadata when there is no fallback", async () => {
		const record = Buffer.from(
			JSON.stringify({ metadataLocation: "s3://analytics/sales/orders/metadata/v9.metadata.json" }),
		);
		h.filer.on("GET *", (_request: Request, recorded: RecordedRequest) =>
			recorded.query.metadata === "true"
				? Response.json({ Extended: { "s3tables.metadata": record.toString("base64") } })
				: new Response("not found", { status: 404 }),
		);
		h.admin.on("GET /api/s3tables/tables", {
			tables: [{ name: "orders", tableARN: ORDERS_ARN, namespace: ["sales"] }],
		});
		const { body } = await h.json("GET", ORDERS);
		expect(body.iceberg).toBeNull();
		expect(body.metadataError).toStartWith("Could not read table metadata");
	});

	test("refuses metadata stored outside SeaweedFS", async () => {
		h.admin.on("GET /api/s3tables/tables", {
			tables: [
				{
					name: "orders",
					tableARN: ORDERS_ARN,
					namespace: ["sales"],
					metadataLocation: "gs://other/v1.metadata.json",
				},
			],
		});
		const { body } = await h.json("GET", ORDERS);
		expect(body.metadataError).toBe(
			"Kelp cannot read metadata stored outside SeaweedFS (gs://other/v1.metadata.json)",
		);
	});

	test("tolerates entries without a catalog record", async () => {
		h.filer.on("GET *", () => Response.json({ Extended: { "s3tables.metadata": "not base64 json" } }));
		h.admin.on("GET /api/s3tables/tables", {
			tables: [{ name: "orders", tableARN: ORDERS_ARN, namespace: ["sales"] }],
		});
		const { body } = await h.json("GET", ORDERS);
		expect(body.iceberg).toBeNull();
		expect(body.owner).toBe("");
	});

	test("unknown tables are 404s", async () => {
		const { status, body } = await h.json("GET", "/tables/buckets/analytics/namespaces/sales/tables/nope");
		expect(status).toBe(404);
		expect(body.error).toBe("Table sales.nope does not exist in analytics");
	});

	test("deletes a table", async () => {
		h.admin.on("DELETE /api/s3tables/tables", { message: "ok" });
		await h.json("DELETE", ORDERS);
		expect(h.admin.last("DELETE", "/api/s3tables/tables")?.query).toEqual({
			bucket: ANALYTICS_ARN,
			namespace: "sales",
			name: "orders",
		});
	});

	test("sets and removes a table policy, and replaces table tags", async () => {
		h.admin.on("PUT /api/s3tables/table-policy", { message: "ok" });
		h.admin.on("DELETE /api/s3tables/table-policy", { message: "ok" });
		h.admin.on("PUT /api/s3tables/tags", { message: "ok" });
		h.admin.on("DELETE /api/s3tables/tags", { message: "ok" });
		await h.json("PUT", `${ORDERS}/policy`, { policy: POLICY });
		expect(body("PUT", "/api/s3tables/table-policy")).toEqual({
			bucket_arn: ANALYTICS_ARN,
			namespace: "sales",
			name: "orders",
			policy: POLICY,
		});
		await h.json("DELETE", `${ORDERS}/policy`);
		expect(h.admin.last("DELETE", "/api/s3tables/table-policy")?.query.name).toBe("orders");
		await h.json("PUT", `${ORDERS}/tags`, { tags: { owner: "finance" } });
		expect(body("DELETE", "/api/s3tables/tags")).toEqual({ resource_arn: ORDERS_ARN, tag_keys: ["pii"] });
		expect(body("PUT", "/api/s3tables/tags")).toEqual({
			resource_arn: ORDERS_ARN,
			tags: { owner: "finance" },
		});
	});
});

describe("data preview", () => {
	test("returns rows from the current snapshot", async () => {
		const { status, body } = await h.json("GET", `${ORDERS}/preview?limit=2`);
		expect(status).toBe(200);
		expect(body.snapshotId).toBe("1000003");
		expect(body.rows).toHaveLength(2);
		expect(body.rows[0][1]).toBe("Bo Lindqvist");
		const ranged = h.filer.requests.filter((r) => r.headers.get("range"));
		expect(ranged.length).toBeGreaterThan(0);
	});

	test("validates the query", async () => {
		expect((await h.json("GET", `${ORDERS}/preview?limit=500`)).status).toBe(400);
		expect((await h.json("GET", `${ORDERS}/preview?snapshot=abc`)).status).toBe(400);
	});

	test("tables without metadata cannot be previewed", async () => {
		h.filer.on("GET *", () => Response.json({ Extended: {} }));
		h.admin.on("GET /api/s3tables/tables", {
			tables: [{ name: "orders", tableARN: ORDERS_ARN, namespace: ["sales"] }],
		});
		const { status, body } = await h.json("GET", `${ORDERS}/preview`);
		expect(status).toBe(422);
		expect(body.error).toBe("This table has no data yet.");
	});

	test("unreadable files become a clear error", async () => {
		h.filer.on("GET *", async (request: Request, recorded: RecordedRequest) => {
			if (recorded.path.endsWith(".avro")) return new Response("garbage");
			const entry = `${import.meta.dir}/../../fixtures/tables/${recorded.path.endsWith("orders") ? "entry-orders.json" : "orders/metadata/v4.metadata.json"}`;
			return new Response(await Bun.file(entry).bytes(), {
				headers: request.headers.get("accept") ? { "content-type": "application/json" } : {},
			});
		});
		const { status, body } = await h.json("GET", `${ORDERS}/preview`);
		expect(status).toBe(422);
		expect(body.error).toStartWith("Could not read the table's files: Not a readable Avro file");
	});

	test("missing files keep the filer's status", async () => {
		h.filer.on("GET *", async (_request: Request, recorded: RecordedRequest) => {
			if (recorded.path.endsWith(".avro")) return new Response("gone", { status: 404 });
			const name = recorded.path.endsWith("orders")
				? "entry-orders.json"
				: "orders/metadata/v4.metadata.json";
			return new Response(await Bun.file(`${import.meta.dir}/../../fixtures/tables/${name}`).bytes());
		});
		expect((await h.json("GET", `${ORDERS}/preview`)).status).toBe(404);
	});
});
