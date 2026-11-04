import { describe, expect, test } from "bun:test";
import {
	filerPathForLocation,
	idString,
	mapIcebergMetadata,
	mapSimpleFields,
	parseIcebergJson,
	typeName,
} from "./metadata.ts";

const ORDERS = `${import.meta.dir}/../../fixtures/tables/orders/metadata/v4.metadata.json`;

describe("parseIcebergJson", () => {
	test("keeps 63-bit ids exact and leaves ordinary numbers alone", () => {
		const parsed = parseIcebergJson<Record<string, unknown>>(
			'{"current-snapshot-id":3051729675574597004,"small":42,"ratio":0.5,"neg":-9007199254740993}',
		);
		expect(parsed).toEqual({
			"current-snapshot-id": "3051729675574597004",
			small: 42,
			ratio: 0.5,
			neg: "-9007199254740993",
		});
	});
});

describe("idString", () => {
	test("accepts numbers, numeric strings and bigints", () => {
		expect(idString(12)).toBe("12");
		expect(idString("3051729675574597004")).toBe("3051729675574597004");
		expect(idString(7n)).toBe("7");
		expect(idString("abc")).toBeNull();
		expect(idString(1.5)).toBeNull();
		expect(idString(undefined)).toBeNull();
	});
});

describe("mapIcebergMetadata", () => {
	test("maps a real table written through the REST catalog", async () => {
		const table = mapIcebergMetadata(parseIcebergJson(await Bun.file(ORDERS).text()));
		expect(table.formatVersion).toBe(2);
		expect(table.location).toBe("s3://analytics/sales/orders");
		expect(table.currentSnapshotId).toBe("1000003");
		expect(table.fields.map((f) => `${f.name}:${f.type}:${f.required}`)).toEqual([
			"order_id:long:true",
			"customer:string:true",
			"region:string:true",
			"amount:double:true",
			"placed_at:timestamptz:true",
			"paid:boolean:false",
		]);
		expect(table.partition).toEqual([
			{ name: "region", sourceName: "region", transform: "identity", fieldId: 1000 },
		]);
		expect(table.snapshots.map((s) => [s.id, s.parentId, s.current])).toEqual([
			["1000003", "1000002", true],
			["1000002", "1000001", false],
			["1000001", null, false],
		]);
		expect(table.snapshots[0]?.operation).toBe("append");
		expect(table.metrics).toEqual({ records: 510, dataFiles: 9, deleteFiles: 0, totalSize: 17133 });
		expect(table.refs).toEqual([{ name: "main", type: "branch", snapshotId: "1000003" }]);
		expect(table.metadataLog[0]?.file).toContain("v3.metadata.json");
		expect(table.properties.owner).toBe("data-platform");
	});

	test("spells out nested types and resolves nested partition and sort sources", () => {
		const table = mapIcebergMetadata({
			"format-version": 2,
			"current-schema-id": 1,
			schemas: [
				{ "schema-id": 0, fields: [] },
				{
					"schema-id": 1,
					fields: [
						{ id: 1, name: "id", type: "long", required: true, doc: "Primary key" },
						{
							id: 2,
							name: "address",
							type: { type: "struct", fields: [{ id: 3, name: "city", type: "string", required: false }] },
						},
						{ id: 4, name: "tags", type: { type: "list", "element-id": 5, element: "string" } },
						{
							id: 6,
							name: "attrs",
							type: {
								type: "map",
								key: "string",
								value: { type: "struct", fields: [{ id: 9, name: "v", type: "decimal(10,2)" }] },
							},
						},
						{ id: 10, name: "odd", type: { kind: "mystery" } },
					],
				},
			],
			"default-spec-id": 0,
			"partition-specs": [
				{
					"spec-id": 0,
					fields: [
						{ "source-id": 3, "field-id": 1000, name: "city_bucket", transform: "bucket[16]" },
						{ "source-id": 99, name: "ghost" },
					],
				},
			],
			"default-sort-order-id": 1,
			"sort-orders": [
				{
					"order-id": 1,
					fields: [{ "source-id": 1, transform: "identity", direction: "desc", "null-order": "nulls-last" }],
				},
			],
			"current-snapshot-id": -1,
			snapshots: [],
		});
		expect(table.fields.map((f) => f.type)).toEqual([
			"long",
			"struct",
			"list<string>",
			"map<string, struct>",
			"unknown",
		]);
		expect(table.fields[0]?.doc).toBe("Primary key");
		expect(table.fields[1]?.children[0]?.name).toBe("city");
		expect(table.fields[3]?.children[0]?.type).toBe("decimal(10,2)");
		expect(table.partition[0]).toEqual({
			name: "city_bucket",
			sourceName: "address.city",
			transform: "bucket[16]",
			fieldId: 1000,
		});
		expect(table.partition[1]?.sourceName).toBe("field 99");
		expect(table.sortOrder).toEqual([
			{ sourceName: "id", transform: "identity", direction: "desc", nullOrder: "nulls-last" },
		]);
		expect(table.currentSnapshotId).toBeNull();
		expect(table.metrics.records).toBeNull();
		expect(table.schemaCount).toBe(2);
	});

	test("reads v1 tables with a single schema and partition spec", () => {
		const table = mapIcebergMetadata({
			"format-version": 1,
			schema: { fields: [{ id: 1, name: "day", type: "date", required: true }] },
			"partition-spec": [{ "source-id": 1, name: "day", transform: "identity" }],
			"current-snapshot-id": "77",
			snapshots: [
				{ "snapshot-id": 77, "timestamp-ms": 1_700_000_000_000, summary: { "total-records": "5" } },
			],
		});
		expect(table.fields[0]?.name).toBe("day");
		expect(table.partition[0]?.sourceName).toBe("day");
		expect(table.snapshots[0]).toMatchObject({
			id: "77",
			operation: "unknown",
			current: true,
			manifestList: null,
		});
		expect(table.metrics.records).toBe(5);
	});

	test("an empty document maps to an empty table", () => {
		const table = mapIcebergMetadata({});
		expect(table).toMatchObject({ fields: [], snapshots: [], schemaCount: 0, uuid: null, lastUpdated: null });
	});
});

describe("helpers", () => {
	test("typeName handles strings and unknown shapes", () => {
		expect(typeName("int")).toBe("int");
		expect(typeName(null)).toBe("unknown");
	});

	test("catalog-only schemas map without ids", () => {
		expect(mapSimpleFields([{ name: "a", type: "long", required: true }, { name: "b" }])).toEqual([
			{ id: null, name: "a", type: "long", required: true, doc: null, children: [] },
			{ id: null, name: "b", type: "unknown", required: false, doc: null, children: [] },
		]);
	});

	test("locations map onto filer paths", () => {
		expect(filerPathForLocation("s3://analytics/sales/orders/data/x.parquet")).toBe(
			"/buckets/analytics/sales/orders/data/x.parquet",
		);
		expect(filerPathForLocation("s3a://b")).toBe("/buckets/b");
		expect(filerPathForLocation("/buckets/b/x")).toBe("/buckets/b/x");
		expect(filerPathForLocation("gs://elsewhere/x")).toBeNull();
	});
});
