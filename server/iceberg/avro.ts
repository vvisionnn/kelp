/**
 * Avro object container files as Iceberg uses them: manifest lists and manifests.
 * Longs decode to `bigint` because snapshot ids use all 63 bits.
 */
import { deflateRaw, inflateRaw } from "node:zlib";
import avro from "avsc";
import { snappyUncompress } from "hyparquet";

type Callback = (error: Error | null, result?: Buffer) => void;

/** `long` as bigint, so 63-bit snapshot ids survive a round trip. */
const longType = avro.types.LongType.__with({
	fromBuffer: (buffer: Buffer) => buffer.readBigInt64LE(),
	toBuffer: (value: bigint | number) => {
		const buffer = Buffer.alloc(8);
		buffer.writeBigInt64LE(BigInt(value));
		return buffer;
	},
	fromJSON: (value: unknown) => BigInt(value as number),
	toJSON: (value: bigint) => Number(value),
	isValid: (value: unknown) => typeof value === "bigint",
	compare: (a: bigint, b: bigint) => (a === b ? 0 : a < b ? -1 : 1),
});

/** Avro type for `schema` with bigint longs. */
export function avroType(schema: unknown): avro.Type {
	return avro.Type.forSchema(schema as avro.Schema, { registry: { long: longType } });
}

/** Avro snappy blocks are raw snappy followed by a 4-byte CRC32 of the uncompressed data. */
function snappyBlock(buffer: Buffer, done: Callback) {
	try {
		const compressed = buffer.subarray(0, buffer.length - 4);
		let length = 0;
		let shift = 0;
		for (const byte of compressed) {
			length |= (byte & 0x7f) << shift;
			if (byte < 0x80) break;
			shift += 7;
		}
		const output = new Uint8Array(length);
		snappyUncompress(compressed, output);
		done(null, Buffer.from(output));
	} catch (error) {
		done(error as Error);
	}
}

const DECODERS = {
	null: (buffer: Buffer, done: Callback) => done(null, buffer),
	deflate: (buffer: Buffer, done: Callback) => inflateRaw(buffer, done),
	snappy: snappyBlock,
};

export interface AvroFile<T> {
	/** Header metadata (Iceberg stores schema, partition spec and format version here). */
	metadata: Record<string, string>;
	records: T[];
}

/** Decodes a whole Avro object container file held in memory. */
export function readAvro<T = Record<string, unknown>>(bytes: Uint8Array): Promise<AvroFile<T>> {
	return new Promise((resolve, reject) => {
		const records: T[] = [];
		const metadata: Record<string, string> = {};
		const decoder = new avro.streams.BlockDecoder({
			codecs: DECODERS,
			parseHook: (schema: avro.Schema) => avroType(schema),
		});
		decoder.on("metadata", (_type: avro.Type, codec: string, header: { meta: Record<string, Buffer> }) => {
			for (const [key, value] of Object.entries(header.meta)) metadata[key] = value.toString("utf8");
			metadata["avro.codec"] ??= codec;
		});
		decoder.on("data", (record: T) => records.push(record));
		decoder.on("error", (error: Error) => reject(new Error(`Not a readable Avro file: ${error.message}`)));
		decoder.on("end", () => resolve({ metadata, records }));
		decoder.end(Buffer.from(bytes));
	});
}

/** Encodes records into an Avro object container file (deflate), as Iceberg writers do. */
export function writeAvro(
	schema: unknown,
	records: unknown[],
	metadata: Record<string, string> = {},
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		const encoder = new avro.streams.BlockEncoder(avroType(schema), {
			codec: "deflate",
			codecs: { deflate: (buffer: Buffer, done: Callback) => deflateRaw(buffer, done) },
			metadata: Object.fromEntries(Object.entries(metadata).map(([key, value]) => [key, Buffer.from(value)])),
		} as ConstructorParameters<typeof avro.streams.BlockEncoder>[1]);
		// Encode with bigint longs, but write the original schema so field-id annotations survive.
		(encoder as unknown as { _schema: unknown })._schema = schema;
		encoder.on("data", (chunk: Buffer) => chunks.push(chunk));
		encoder.on("error", reject);
		encoder.on("end", () => resolve(Buffer.concat(chunks)));
		for (const record of records) encoder.write(record);
		encoder.end();
	});
}

const optional = (type: unknown) => ["null", type];

/** Iceberg v2 manifest list entry (`manifest_file`). */
export const MANIFEST_FILE_SCHEMA = {
	type: "record",
	name: "manifest_file",
	fields: [
		{ name: "manifest_path", type: "string", "field-id": 500 },
		{ name: "manifest_length", type: "long", "field-id": 501 },
		{ name: "partition_spec_id", type: "int", "field-id": 502 },
		{ name: "content", type: "int", "field-id": 517 },
		{ name: "sequence_number", type: "long", "field-id": 515 },
		{ name: "min_sequence_number", type: "long", "field-id": 516 },
		{ name: "added_snapshot_id", type: "long", "field-id": 503 },
		{ name: "added_files_count", type: "int", "field-id": 504 },
		{ name: "existing_files_count", type: "int", "field-id": 505 },
		{ name: "deleted_files_count", type: "int", "field-id": 506 },
		{ name: "added_rows_count", type: "long", "field-id": 512 },
		{ name: "existing_rows_count", type: "long", "field-id": 513 },
		{ name: "deleted_rows_count", type: "long", "field-id": 514 },
		{
			name: "partitions",
			type: optional({
				type: "array",
				"element-id": 508,
				items: {
					type: "record",
					name: "r508",
					fields: [
						{ name: "contains_null", type: "boolean", "field-id": 509 },
						{ name: "contains_nan", type: optional("boolean"), default: null, "field-id": 518 },
						{ name: "lower_bound", type: optional("bytes"), default: null, "field-id": 510 },
						{ name: "upper_bound", type: optional("bytes"), default: null, "field-id": 511 },
					],
				},
			}),
			default: null,
			"field-id": 507,
		},
		{ name: "key_metadata", type: optional("bytes"), default: null, "field-id": 519 },
	],
};

export interface PartitionField {
	name: string;
	fieldId: number;
	/** Avro type of the partition value, e.g. "string" or "int". */
	type: string;
}

/** Iceberg v2 manifest entry schema for a partition spec. */
export function manifestEntrySchema(partition: PartitionField[]) {
	return {
		type: "record",
		name: "manifest_entry",
		fields: [
			{ name: "status", type: "int", "field-id": 0 },
			{ name: "snapshot_id", type: optional("long"), default: null, "field-id": 1 },
			{ name: "sequence_number", type: optional("long"), default: null, "field-id": 3 },
			{ name: "file_sequence_number", type: optional("long"), default: null, "field-id": 4 },
			{
				name: "data_file",
				"field-id": 2,
				type: {
					type: "record",
					name: "r2",
					fields: [
						{ name: "content", type: "int", "field-id": 134 },
						{ name: "file_path", type: "string", "field-id": 100 },
						{ name: "file_format", type: "string", "field-id": 101 },
						{
							name: "partition",
							"field-id": 102,
							type: {
								type: "record",
								name: "r102",
								fields: partition.map((field) => ({
									name: field.name,
									type: optional(field.type),
									default: null,
									"field-id": field.fieldId,
								})),
							},
						},
						{ name: "record_count", type: "long", "field-id": 103 },
						{ name: "file_size_in_bytes", type: "long", "field-id": 104 },
						{
							name: "split_offsets",
							type: optional({ type: "array", items: "long", "element-id": 133 }),
							default: null,
							"field-id": 132,
						},
						{ name: "sort_order_id", type: optional("int"), default: null, "field-id": 140 },
					],
				},
			},
		],
	};
}
