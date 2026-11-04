/**
 * Creates real Iceberg tables with data in a SeaweedFS stack, the way an engine like Spark would:
 * tables through the S3 Tables API and the Iceberg REST catalog, Parquet data files, Avro
 * manifests, and snapshot commits. Used by the seed script and end-to-end tests.
 *
 *   bun scripts/iceberg-sample.ts [--offset 0]
 */
import { parseArgs } from "node:util";
import { ByteWriter, parquetWrite } from "hyparquet-writer";
import {
	MANIFEST_FILE_SCHEMA,
	manifestEntrySchema,
	type PartitionField,
	readAvro,
	writeAvro,
} from "../server/iceberg/avro.ts";
import { S3_CREDENTIALS, stackPorts } from "./stack-lib.ts";

export interface SampleTarget {
	adminUrl: string;
	filerUrl: string;
	icebergUrl: string;
	credentials: { accessKey: string; secretKey: string };
}

interface Column {
	id: number;
	name: string;
	type: "long" | "string" | "double" | "timestamptz" | "boolean" | "int";
	required: boolean;
}

interface SampleTable {
	namespace: string;
	name: string;
	columns: Column[];
	partitionBy?: string;
	/** Each batch becomes one append snapshot. */
	batches: Array<Array<Record<string, unknown>>>;
}

/** Deterministic pseudo-random numbers so every seeded environment looks the same. */
function random(seed: number) {
	let state = seed;
	return () => {
		state = (state * 1664525 + 1013904223) % 4294967296;
		return state / 4294967296;
	};
}

const REGIONS = ["eu-west", "us-east", "ap-south"];
const CUSTOMERS = [
	"Ada Fisher",
	"Bo Lindqvist",
	"Chen Wei",
	"Dara Okafor",
	"Elif Kaya",
	"Felix Moreau",
	"Gita Rao",
];
const PAGES = ["/", "/pricing", "/docs", "/docs/s3", "/blog/kelp", "/signup"];

function orders(seed: number, count: number, startId: number, start: number) {
	const next = random(seed);
	return Array.from({ length: count }, (_, i) => ({
		order_id: BigInt(startId + i),
		customer: CUSTOMERS[Math.floor(next() * CUSTOMERS.length)],
		region: REGIONS[Math.floor(next() * REGIONS.length)],
		amount: Math.round(next() * 50000) / 100,
		placed_at: BigInt((start + i * 37_000) * 1000),
		paid: next() > 0.2,
	}));
}

function pageViews(seed: number, count: number, start: number) {
	const next = random(seed);
	return Array.from({ length: count }, (_, i) => ({
		view_id: BigInt(i + 1),
		path: PAGES[Math.floor(next() * PAGES.length)],
		duration_ms: Math.floor(next() * 9000),
		viewed_at: BigInt((start + i * 4_000) * 1000),
	}));
}

const DAY = 86_400_000;
const EPOCH = Date.UTC(2026, 9, 1);

export const SAMPLE_TABLES: SampleTable[] = [
	{
		namespace: "sales",
		name: "orders",
		columns: [
			{ id: 1, name: "order_id", type: "long", required: true },
			{ id: 2, name: "customer", type: "string", required: true },
			{ id: 3, name: "region", type: "string", required: true },
			{ id: 4, name: "amount", type: "double", required: true },
			{ id: 5, name: "placed_at", type: "timestamptz", required: true },
			{ id: 6, name: "paid", type: "boolean", required: false },
		],
		partitionBy: "region",
		batches: [
			orders(7, 240, 1, EPOCH),
			orders(11, 180, 241, EPOCH + 3 * DAY),
			orders(13, 90, 421, EPOCH + 6 * DAY),
		],
	},
	{
		namespace: "web",
		name: "page_views",
		columns: [
			{ id: 1, name: "view_id", type: "long", required: true },
			{ id: 2, name: "path", type: "string", required: true },
			{ id: 3, name: "duration_ms", type: "int", required: true },
			{ id: 4, name: "viewed_at", type: "timestamptz", required: true },
		],
		batches: [pageViews(3, 500, EPOCH)],
	},
];

const PARQUET: Record<Column["type"], object> = {
	long: { type: "INT64" },
	int: { type: "INT32" },
	string: { type: "BYTE_ARRAY", converted_type: "UTF8" },
	double: { type: "DOUBLE" },
	boolean: { type: "BOOLEAN" },
	timestamptz: { type: "INT64", logical_type: { type: "TIMESTAMP", isAdjustedToUTC: true, unit: "MICROS" } },
};

function parquetFile(columns: Column[], rows: Array<Record<string, unknown>>): Uint8Array {
	const writer = new ByteWriter();
	parquetWrite({
		writer,
		columnData: columns.map((c) => ({
			name: c.name,
			data: rows.map((r) => r[c.name]) as never,
			nullable: !c.required,
		})),
		schema: [
			{ name: "schema", num_children: columns.length },
			...columns.map((c) => ({
				name: c.name,
				field_id: c.id,
				repetition_type: c.required ? "REQUIRED" : "OPTIONAL",
				...PARQUET[c.type],
			})),
		] as never,
	});
	return new Uint8Array(writer.getBuffer());
}

class Catalog {
	private token = "";
	constructor(private readonly target: SampleTarget) {}

	async request(method: string, path: string, body?: unknown) {
		if (!this.token) {
			const response = await fetch(`${this.target.icebergUrl}/v1/oauth/tokens`, {
				method: "POST",
				body: new URLSearchParams({
					grant_type: "client_credentials",
					client_id: this.target.credentials.accessKey,
					client_secret: this.target.credentials.secretKey,
				}),
			});
			this.token = ((await response.json()) as { access_token: string }).access_token;
		}
		const response = await fetch(`${this.target.icebergUrl}/v1${path}`, {
			method,
			headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		});
		const text = await response.text();
		if (!response.ok) throw new Error(`Iceberg ${method} ${path}: ${response.status} ${text}`);
		return text ? JSON.parse(text) : null;
	}
}

async function admin(target: SampleTarget, method: string, path: string, body?: unknown) {
	const response = await fetch(`${target.adminUrl}/api/s3tables${path}`, {
		method,
		headers: { "content-type": "application/json" },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
	const text = await response.text();
	if (!response.ok && response.status !== 409)
		throw new Error(`admin ${method} ${path}: ${response.status} ${text}`);
	return text ? JSON.parse(text) : null;
}

/** `s3://bucket/key` -> filer path under /buckets. */
const filerPath = (location: string) => location.replace(/^s3a?:\/\//, "/buckets/");

async function put(target: SampleTarget, location: string, bytes: Uint8Array) {
	const response = await fetch(`${target.filerUrl}${filerPath(location)}`, {
		method: "PUT",
		body: new Blob([bytes as Uint8Array<ArrayBuffer>]),
	});
	if (!response.ok) throw new Error(`filer PUT ${location}: ${response.status}`);
}

async function get(target: SampleTarget, location: string): Promise<Uint8Array> {
	const response = await fetch(`${target.filerUrl}${filerPath(location)}`);
	if (!response.ok) throw new Error(`filer GET ${location}: ${response.status}`);
	return new Uint8Array(await response.arrayBuffer());
}

async function append(
	target: SampleTarget,
	catalog: Catalog,
	bucket: string,
	table: SampleTable,
	rows: Array<Record<string, unknown>>,
	snapshotId: number,
) {
	const tablePath = `/${bucket}/namespaces/${table.namespace}/tables/${table.name}`;
	const { metadata } = await catalog.request("GET", tablePath);
	const location: string = metadata.location;
	const current: number | null = metadata["current-snapshot-id"] > 0 ? metadata["current-snapshot-id"] : null;
	const sequence = Number(metadata["last-sequence-number"]) + 1;
	const partitionColumn = table.columns.find((c) => c.name === table.partitionBy);
	const partitionFields: PartitionField[] = partitionColumn
		? [{ name: partitionColumn.name, fieldId: 1000, type: "string" }]
		: [];

	const groups = new Map<string, Array<Record<string, unknown>>>();
	for (const row of rows) {
		const key = partitionColumn ? String(row[partitionColumn.name]) : "";
		groups.set(key, [...(groups.get(key) ?? []), row]);
	}

	const entries: Array<Record<string, unknown>> = [];
	let addedSize = 0;
	for (const [value, group] of groups) {
		const bytes = parquetFile(table.columns, group);
		const dir = partitionColumn ? `${location}/data/${partitionColumn.name}=${value}` : `${location}/data`;
		const path: string = `${dir}/${snapshotId}-${entries.length}.parquet`;
		await put(target, path, bytes);
		addedSize += bytes.length;
		entries.push({
			status: 1,
			snapshot_id: BigInt(snapshotId),
			sequence_number: null,
			file_sequence_number: null,
			data_file: {
				content: 0,
				file_path: path,
				file_format: "PARQUET",
				partition: partitionColumn ? { [partitionColumn.name]: value } : {},
				record_count: BigInt(group.length),
				file_size_in_bytes: BigInt(bytes.length),
				split_offsets: null,
				sort_order_id: null,
			},
		});
	}

	const schema = metadata.schemas.find(
		(s: { "schema-id": number }) => s["schema-id"] === metadata["current-schema-id"],
	);
	const spec = metadata["partition-specs"].find(
		(s: { "spec-id": number }) => s["spec-id"] === metadata["default-spec-id"],
	);
	const manifest = await writeAvro(manifestEntrySchema(partitionFields), entries, {
		schema: JSON.stringify(schema),
		"schema-id": String(schema["schema-id"]),
		"partition-spec": JSON.stringify(spec.fields),
		"partition-spec-id": String(spec["spec-id"]),
		"format-version": "2",
		content: "data",
	});
	const manifestPath = `${location}/metadata/${snapshotId}-m0.avro`;
	await put(target, manifestPath, manifest);

	const previous = current
		? metadata.snapshots.find((s: { "snapshot-id": number }) => s["snapshot-id"] === current)
		: undefined;
	const carried = previous ? (await readAvro(await get(target, previous["manifest-list"]))).records : [];
	const manifestList = await writeAvro(
		MANIFEST_FILE_SCHEMA,
		[
			{
				manifest_path: manifestPath,
				manifest_length: BigInt(manifest.length),
				partition_spec_id: spec["spec-id"],
				content: 0,
				sequence_number: BigInt(sequence),
				min_sequence_number: BigInt(sequence),
				added_snapshot_id: BigInt(snapshotId),
				added_files_count: entries.length,
				existing_files_count: 0,
				deleted_files_count: 0,
				added_rows_count: BigInt(rows.length),
				existing_rows_count: 0n,
				deleted_rows_count: 0n,
				partitions: null,
				key_metadata: null,
			},
			...carried,
		],
		{
			"snapshot-id": String(snapshotId),
			"parent-snapshot-id": current ? String(current) : "null",
			"sequence-number": String(sequence),
			"format-version": "2",
		},
	);
	const listPath = `${location}/metadata/snap-${snapshotId}-1.avro`;
	await put(target, listPath, manifestList);

	const prior = previous?.summary ?? {};
	const total = (key: string, added: number) => String(Number(prior[key] ?? 0) + added);
	await catalog.request("POST", tablePath, {
		requirements: [{ type: "assert-ref-snapshot-id", ref: "main", "snapshot-id": current }],
		updates: [
			{
				action: "add-snapshot",
				snapshot: {
					"snapshot-id": snapshotId,
					...(current ? { "parent-snapshot-id": current } : {}),
					"sequence-number": sequence,
					// Commits must not predate the table's last update, so use the commit time.
					"timestamp-ms": Math.max(Date.now(), Number(metadata["last-updated-ms"]) + 1),
					"manifest-list": listPath,
					"schema-id": schema["schema-id"],
					summary: {
						operation: "append",
						"added-data-files": String(entries.length),
						"added-records": String(rows.length),
						"added-files-size": String(addedSize),
						"changed-partition-count": String(groups.size),
						"total-records": total("total-records", rows.length),
						"total-data-files": total("total-data-files", entries.length),
						"total-files-size": total("total-files-size", addedSize),
						"total-delete-files": "0",
						"total-position-deletes": "0",
						"total-equality-deletes": "0",
					},
				},
			},
			{ action: "set-snapshot-ref", "ref-name": "main", type: "branch", "snapshot-id": snapshotId },
		],
	});
}

/** Creates the `analytics` table bucket with sample tables. Skips tables that already exist. */
export async function createSampleTables(target: SampleTarget, bucket = "analytics"): Promise<void> {
	await admin(target, "POST", "/buckets", { name: bucket, tags: { team: "data", env: "review" } });
	const { buckets } = await admin(target, "GET", "/buckets");
	const arn = (buckets as Array<{ name: string; arn: string }>).find((b) => b.name === bucket)?.arn;
	if (!arn) throw new Error(`table bucket ${bucket} was not created`);

	const catalog = new Catalog(target);
	for (const namespace of ["sales", "web", "finance"]) {
		await admin(target, "POST", "/namespaces", { bucket_arn: arn, name: namespace });
	}

	for (const [index, table] of SAMPLE_TABLES.entries()) {
		const existing = await catalog.request("GET", `/${bucket}/namespaces/${table.namespace}/tables`);
		if (existing.identifiers.some((id: { name: string }) => id.name === table.name)) continue;
		const partitionColumn = table.columns.find((c) => c.name === table.partitionBy);
		await catalog.request("POST", `/${bucket}/namespaces/${table.namespace}/tables`, {
			name: table.name,
			schema: {
				type: "struct",
				"schema-id": 0,
				fields: table.columns.map((c) => ({ id: c.id, name: c.name, type: c.type, required: c.required })),
			},
			"partition-spec": {
				"spec-id": 0,
				fields: partitionColumn
					? [
							{
								"source-id": partitionColumn.id,
								"field-id": 1000,
								name: partitionColumn.name,
								transform: "identity",
							},
						]
					: [],
			},
			properties: { "format-version": "2", owner: "data-platform", "write.format.default": "parquet" },
		});
		for (const [batch, rows] of table.batches.entries()) {
			const snapshotId = 1_000_000 * (index + 1) + batch + 1;
			await append(target, catalog, bucket, table, rows, snapshotId);
		}
	}

	// A table registered without data: the catalog knows its schema, nothing is written yet.
	await admin(target, "POST", "/tables", {
		bucket_arn: arn,
		namespace: "finance",
		name: "invoices",
		metadata: {
			iceberg: {
				schema: {
					fields: [
						{ name: "invoice_id", type: "long", required: true },
						{ name: "customer", type: "string", required: true },
						{ name: "total", type: "double" },
						{ name: "due_on", type: "date" },
					],
				},
			},
		},
	});
}

if (import.meta.main) {
	const { values } = parseArgs({ options: { offset: { type: "string", default: "0" } } });
	const ports = stackPorts(Number(values.offset));
	await createSampleTables({
		adminUrl: `http://127.0.0.1:${ports.admin}`,
		filerUrl: `http://127.0.0.1:${ports.filer}`,
		icebergUrl: `http://127.0.0.1:${ports.iceberg}`,
		credentials: S3_CREDENTIALS,
	});
	console.log("[iceberg-sample] analytics tables ready");
}
