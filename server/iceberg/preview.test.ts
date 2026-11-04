import { describe, expect, test } from "bun:test";
import type { IcebergTable } from "../../shared/tables.ts";
import { MANIFEST_FILE_SCHEMA, manifestEntrySchema, writeAvro } from "./avro.ts";
import { mapIcebergMetadata, parseIcebergJson } from "./metadata.ts";
import { cell, type FileReader, previewTable } from "./preview.ts";

const ROOT = `${import.meta.dir}/../../fixtures/tables/orders`;
const PREFIX = "/buckets/analytics/sales/orders/";

/** Serves the captured `orders` table from disk, plus any extra in-memory files. */
function fixtureReader(extra: Record<string, Uint8Array> = {}) {
	const reads: string[] = [];
	const reader: FileReader = {
		async read(path, range) {
			reads.push(range ? `${path}@${range.start}-${range.end}` : path);
			const bytes =
				extra[path] ??
				(path.startsWith(PREFIX) ? await Bun.file(`${ROOT}/${path.slice(PREFIX.length)}`).bytes() : null);
			if (!bytes) throw new Error(`no file ${path}`);
			return range ? bytes.slice(range.start, range.end + 1) : bytes;
		},
	};
	return { reader, reads };
}

async function orders(): Promise<IcebergTable> {
	return mapIcebergMetadata(parseIcebergJson(await Bun.file(`${ROOT}/metadata/v4.metadata.json`).text()));
}

describe("previewTable", () => {
	test("lists live files and reads the first rows of a Parquet file with ranged reads", async () => {
		const { reader, reads } = fixtureReader();
		const preview = await previewTable(reader, await orders(), { limit: 3 });
		expect(preview.snapshotId).toBe("1000003");
		expect(preview.files).toHaveLength(9);
		expect(preview.files[0]).toEqual({
			path: "s3://analytics/sales/orders/data/region=us-east/1000003-0.parquet",
			format: "PARQUET",
			records: 33,
			size: 1494,
			partition: { region: "us-east" },
		});
		expect(preview.columns).toEqual(["order_id", "customer", "region", "amount", "placed_at", "paid"]);
		expect(preview.rows).toEqual([
			["421", "Bo Lindqvist", "us-east", "360.37", "2026-10-07T00:00:00.000Z", "false"],
			["422", "Ada Fisher", "us-east", "473.6", "2026-10-07T00:00:37.000Z", "true"],
			["425", "Elif Kaya", "us-east", "132.81", "2026-10-07T00:02:28.000Z", "false"],
		]);
		expect(preview.hasDeletes).toBe(false);
		expect(reads.some((r) => r.includes(".parquet@"))).toBe(true);
	});

	test("an older snapshot only sees its own files", async () => {
		const { reader } = fixtureReader();
		const preview = await previewTable(reader, await orders(), {
			limit: 1,
			snapshotId: "1000001",
			file: "s3://analytics/sales/orders/data/region=us-east/1000003-0.parquet",
		});
		expect(preview.files).toHaveLength(3);
		expect(preview.files.every((f) => f.path.includes("/1000001-"))).toBe(true);
		expect(preview.notes).toEqual(["That file is not part of this snapshot."]);
	});

	test("explains snapshots and files that do not exist", async () => {
		const { reader } = fixtureReader();
		const table = await orders();
		expect((await previewTable(reader, table, { limit: 1, snapshotId: "42" })).notes).toEqual([
			"Snapshot 42 is not part of this table.",
		]);
		const missing = await previewTable(reader, table, { limit: 1, file: "s3://analytics/elsewhere.parquet" });
		expect(missing.notes).toEqual(["That file is not part of this snapshot."]);
		expect(missing.rows).toEqual([]);
		const empty = { ...table, snapshots: [], currentSnapshotId: null };
		expect((await previewTable(reader, empty, { limit: 1 })).notes).toEqual(["This table has no data yet."]);
		const noList = { ...table, snapshots: table.snapshots.map((s) => ({ ...s, manifestList: null })) };
		expect((await previewTable(reader, noList, { limit: 1 })).notes).toEqual([
			"This snapshot has no manifest list.",
		]);
	});

	test("refuses locations outside SeaweedFS", async () => {
		const { reader } = fixtureReader();
		const table = await orders();
		const foreign = {
			...table,
			snapshots: table.snapshots.map((s) => ({ ...s, manifestList: "gs://x/list.avro" })),
		};
		await expect(previewTable(reader, foreign, { limit: 1 })).rejects.toThrow(
			"Kelp can only read files stored in SeaweedFS",
		);
	});

	test("notes delete files, skips removed and non-data entries, and declines other formats", async () => {
		const entry = (status: number, content: number, path: string, format = "PARQUET") => ({
			status,
			snapshot_id: 9n,
			sequence_number: null,
			file_sequence_number: null,
			data_file: {
				content,
				file_path: path,
				file_format: format,
				partition: {},
				record_count: 1n,
				file_size_in_bytes: 0n,
				split_offsets: null,
				sort_order_id: null,
			},
		});
		const manifest = await writeAvro(manifestEntrySchema([]), [
			entry(2, 0, "s3://b/t/data/removed.parquet"),
			entry(1, 1, "s3://b/t/data/pos-delete.parquet"),
			entry(1, 0, "s3://b/t/data/a.orc", "ORC"),
		]);
		const listEntry = (path: string, content: number) => ({
			manifest_path: path,
			manifest_length: 1n,
			partition_spec_id: 0,
			content,
			sequence_number: 1n,
			min_sequence_number: 1n,
			added_snapshot_id: 9n,
			added_files_count: 1,
			existing_files_count: 0,
			deleted_files_count: 0,
			added_rows_count: 1n,
			existing_rows_count: 0n,
			deleted_rows_count: 0n,
			partitions: null,
			key_metadata: null,
		});
		const list = await writeAvro(MANIFEST_FILE_SCHEMA, [
			listEntry("s3://b/t/metadata/m.avro", 0),
			listEntry("s3://b/t/metadata/d.avro", 1),
		]);
		const { reader } = fixtureReader({
			"/buckets/b/t/metadata/list.avro": list,
			"/buckets/b/t/metadata/m.avro": manifest,
		});
		const table = mapIcebergMetadata({
			"current-snapshot-id": 9,
			snapshots: [{ "snapshot-id": 9, "manifest-list": "s3://b/t/metadata/list.avro" }],
		});
		const preview = await previewTable(reader, table, { limit: 5 });
		expect(preview.hasDeletes).toBe(true);
		expect(preview.files.map((f) => f.path)).toEqual(["s3://b/t/data/a.orc"]);
		expect(preview.notes).toContain("Kelp previews Parquet files; this snapshot has none.");
		const orc = await previewTable(reader, table, { limit: 5, file: "s3://b/t/data/a.orc" });
		expect(orc.file).toBe("s3://b/t/data/a.orc");
		expect(orc.notes).toContain("Kelp previews Parquet files; ORC files cannot be shown.");
	});

	test("caps very large snapshots and reads sizes it was not told", async () => {
		const parquet = await Bun.file(`${ROOT}/data/region=us-east/1000003-0.parquet`).bytes();
		const entries = Array.from({ length: 501 }, (_, i) => ({
			status: 1,
			snapshot_id: 9n,
			sequence_number: null,
			file_sequence_number: null,
			data_file: {
				content: 0,
				file_path: i === 0 ? "s3://b/t/data/0.parquet" : `s3://b/t/data/${i}.parquet`,
				file_format: "parquet",
				partition: {},
				record_count: 33n,
				file_size_in_bytes: 0n,
				split_offsets: null,
				sort_order_id: null,
			},
		}));
		const manifest = await writeAvro(manifestEntrySchema([]), entries);
		const list = await writeAvro(MANIFEST_FILE_SCHEMA, [
			{
				manifest_path: "s3://b/t/metadata/m.avro",
				manifest_length: 1n,
				partition_spec_id: 0,
				content: 0,
				sequence_number: 1n,
				min_sequence_number: 1n,
				added_snapshot_id: 9n,
				added_files_count: 501,
				existing_files_count: 0,
				deleted_files_count: 0,
				added_rows_count: 1n,
				existing_rows_count: 0n,
				deleted_rows_count: 0n,
				partitions: null,
				key_metadata: null,
			},
		]);
		const { reader } = fixtureReader({
			"/buckets/b/t/metadata/list.avro": list,
			"/buckets/b/t/metadata/m.avro": manifest,
			"/buckets/b/t/data/0.parquet": parquet,
		});
		const table = mapIcebergMetadata({
			"current-snapshot-id": 9,
			snapshots: [{ "snapshot-id": 9, "manifest-list": "s3://b/t/metadata/list.avro" }],
		});
		const preview = await previewTable(reader, table, { limit: 2 });
		expect(preview.files).toHaveLength(500);
		expect(preview.notes).toContain("Showing the first 500 data files.");
		expect(preview.rows).toHaveLength(2);
	});
});

describe("cell", () => {
	test("renders every decoded value as text", () => {
		expect(cell(null)).toBeNull();
		expect(cell(undefined)).toBeNull();
		expect(cell(new Date("2026-01-02T03:04:05Z"))).toBe("2026-01-02T03:04:05.000Z");
		expect(cell(new Date(Number.NaN))).toBe("Invalid date");
		expect(cell(12n)).toBe("12");
		expect(cell(new Uint8Array([1, 255]))).toBe("0x01ff");
		expect(cell(new Uint8Array(40))).toEndWith("…");
		expect(cell({ a: 1n, b: [1, 2] })).toBe('{"a":"1","b":[1,2]}');
		expect(cell("x".repeat(250))).toHaveLength(201);
		expect(cell(true)).toBe("true");
	});
});
