import { describe, expect, test } from "bun:test";
import { crc32 } from "node:zlib";
import avro from "avsc";
import { snappyCompress } from "hyparquet-writer/src/snappy.js";
import { avroType, MANIFEST_FILE_SCHEMA, manifestEntrySchema, readAvro, writeAvro } from "./avro.ts";

const FIXTURES = `${import.meta.dir}/../../fixtures/tables/orders/metadata`;
const SCHEMA = { type: "record", name: "r", fields: [{ name: "id", type: "long", "field-id": 1 }] };

/** Encodes with avsc directly, for codecs Kelp only needs to read. */
function encode(codec: string, codecs: Record<string, unknown>, records: unknown[]): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		const encoder = new avro.streams.BlockEncoder(
			avro.Type.forSchema({ type: "record", name: "r", fields: [{ name: "n", type: "string" }] }),
			{
				codec,
				codecs,
			} as never,
		);
		encoder.on("data", (c: Buffer) => chunks.push(c));
		encoder.on("error", reject);
		encoder.on("end", () => resolve(Buffer.concat(chunks)));
		for (const r of records) encoder.write(r);
		encoder.end();
	});
}

describe("avro", () => {
	test("round-trips 63-bit longs exactly and keeps field ids in the header", async () => {
		const big = 9_123_456_789_012_345_678n;
		const bytes = await writeAvro(SCHEMA, [{ id: big }, { id: 1n }], { "snapshot-id": String(big) });
		const file = await readAvro<{ id: bigint }>(bytes);
		expect(file.records.map((r) => r.id)).toEqual([big, 1n]);
		expect(file.metadata["snapshot-id"]).toBe(String(big));
		expect(file.metadata["avro.codec"]).toBe("deflate");
		expect(file.metadata["avro.schema"]).toContain('"field-id":1');
	});

	test("bigint longs convert to and from JSON and compare by value", () => {
		const long = avroType("long");
		expect(long.fromString("42")).toBe(42n);
		expect(long.toString(42n)).toBe("42");
		expect([long.compare(1n, 2n), long.compare(2n, 2n), long.compare(3n, 2n)]).toEqual([-1, 0, 1]);
		expect(long.isValid(1)).toBe(false);
	});

	test("reads the manifest list SeaweedFS accepted for a real table", async () => {
		const list = await readAvro<Record<string, unknown>>(
			await Bun.file(`${FIXTURES}/snap-1000003-1.avro`).bytes(),
		);
		expect(list.records.map((r) => r.added_snapshot_id)).toEqual([1000003n, 1000002n, 1000001n]);
		expect(list.records[0]?.manifest_path).toBe("s3://analytics/sales/orders/metadata/1000003-m0.avro");
		expect(list.metadata["format-version"]).toBe("2");
	});

	test("decodes uncompressed and snappy blocks", async () => {
		const plain = await encode(
			"null",
			{ null: (b: Buffer, done: (e: null, b: Buffer) => void) => done(null, b) },
			[{ n: "a" }, { n: "b" }],
		);
		expect((await readAvro<{ n: string }>(plain)).records).toEqual([{ n: "a" }, { n: "b" }]);

		const snappy = await encode(
			"snappy",
			{
				snappy: (buffer: Buffer, done: (e: Error | null, b?: Buffer) => void) => {
					const checksum = Buffer.alloc(4);
					checksum.writeUInt32BE(crc32(buffer));
					done(null, Buffer.concat([Buffer.from(snappyCompress(buffer)), checksum]));
				},
			},
			Array.from({ length: 50 }, (_, i) => ({ n: `row-${i}-${"x".repeat(i)}` })),
		);
		const decoded = await readAvro<{ n: string }>(snappy);
		expect(decoded.records).toHaveLength(50);
		expect(decoded.records[49]?.n).toStartWith("row-49-x");
	});

	test("reports corrupt snappy blocks and non-Avro bytes", async () => {
		const broken = await encode(
			"snappy",
			{
				snappy: (_b: Buffer, done: (e: Error | null, b?: Buffer) => void) =>
					done(null, Buffer.from([0x05, 0xff, 0, 0, 0, 0])),
			},
			[{ n: "a" }],
		);
		await expect(readAvro(broken)).rejects.toThrow("Not a readable Avro file");
		await expect(readAvro(new TextEncoder().encode("not avro"))).rejects.toThrow("Not a readable Avro file");
	});

	test("manifest schemas carry the spec's field ids", async () => {
		expect(JSON.stringify(MANIFEST_FILE_SCHEMA)).toContain('"field-id":507');
		const entry = manifestEntrySchema([{ name: "region", fieldId: 1000, type: "string" }]);
		const bytes = await writeAvro(entry, [
			{
				status: 1,
				snapshot_id: 5n,
				sequence_number: null,
				file_sequence_number: null,
				data_file: {
					content: 0,
					file_path: "s3://b/t/data/x.parquet",
					file_format: "PARQUET",
					partition: { region: "eu" },
					record_count: 3n,
					file_size_in_bytes: 100n,
					split_offsets: [4n],
					sort_order_id: 0,
				},
			},
		]);
		const { records, metadata } = await readAvro<{
			data_file: { partition: unknown; split_offsets: bigint[] };
		}>(bytes);
		expect(records[0]?.data_file.partition).toEqual({ region: "eu" });
		expect(records[0]?.data_file.split_offsets).toEqual([4n]);
		expect(metadata["avro.schema"]).toContain('"field-id":1000');
	});
});
