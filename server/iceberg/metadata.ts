import type {
	IcebergField,
	IcebergMetrics,
	IcebergPartitionField,
	IcebergSnapshot,
	IcebergSortField,
	IcebergTable,
} from "../../shared/tables.ts";
import { list, num, obj, type Raw, str } from "../map/raw.ts";

/**
 * Parses Iceberg JSON keeping integers beyond 2^53 exact: they become strings. Snapshot ids use
 * all 63 bits, so plain `JSON.parse` would silently change them.
 */
export function parseIcebergJson<T = Raw>(text: string): T {
	return JSON.parse(text, (_key, value, context?: { source?: string }) =>
		typeof value === "number" && !Number.isSafeInteger(value) && Number.isInteger(value) && context?.source
			? context.source
			: value,
	) as T;
}

/** An id as an exact string (ids may arrive as numbers or, when huge, as strings). */
export function idString(value: unknown): string | null {
	if (typeof value === "string" && /^-?\d+$/.test(value)) return value;
	if (typeof value === "number" && Number.isInteger(value)) return String(value);
	if (typeof value === "bigint") return value.toString();
	return null;
}

const msTime = (value: unknown): string | null => {
	const ms = num(value);
	return ms > 0 ? new Date(ms).toISOString() : null;
};

const nullableNum = (value: unknown): number | null => {
	const n = num(value, Number.NaN);
	return Number.isNaN(n) ? null : n;
};

/** Readable form of an Iceberg type: primitives as-is, nested types spelled out. */
export function typeName(type: unknown): string {
	if (typeof type === "string") return type;
	const t = obj(type);
	switch (t.type) {
		case "list":
			return `list<${typeName(t.element)}>`;
		case "map":
			return `map<${typeName(t.key)}, ${typeName(t.value)}>`;
		case "struct":
			return "struct";
		default:
			return str(t.type, "unknown");
	}
}

/** Nested fields under a type: struct fields, or the struct inside a list element / map value. */
function childFields(type: unknown): IcebergField[] {
	const t = obj(type);
	if (t.type === "struct") return list(t.fields).map(mapField);
	if (t.type === "list") return childFields(t.element);
	if (t.type === "map") return childFields(t.value);
	return [];
}

function mapField(field: Raw): IcebergField {
	return {
		id: nullableNum(field.id),
		name: str(field.name),
		type: typeName(field.type),
		required: field.required === true,
		doc: str(field.doc) || null,
		children: childFields(field.type),
	};
}

/** Fields from a SeaweedFS catalog-only schema (`{name, type, required}` without ids). */
export function mapSimpleFields(fields: unknown): IcebergField[] {
	return list(fields).map((f) => ({
		id: null,
		name: str(f.name),
		type: str(f.type, "unknown"),
		required: f.required === true,
		doc: null,
		children: [],
	}));
}

function metrics(snapshot: Raw | undefined): IcebergMetrics {
	const summary = obj(snapshot?.summary);
	return {
		records: nullableNum(summary["total-records"]),
		dataFiles: nullableNum(summary["total-data-files"]),
		deleteFiles: nullableNum(summary["total-delete-files"]),
		totalSize: nullableNum(summary["total-files-size"]),
	};
}

/** Maps Iceberg table metadata (v1 or v2) into Kelp's view of a table. */
export function mapIcebergMetadata(raw: Raw): IcebergTable {
	const schemas = list(raw.schemas);
	// v1 tables may only carry a single top-level `schema`.
	const schemaId = raw["current-schema-id"] === undefined ? null : nullableNum(raw["current-schema-id"]);
	const schema =
		schemas.find((s) => schemaId !== null && num(s["schema-id"], -1) === schemaId) ??
		schemas.at(-1) ??
		obj(raw.schema);
	const fields = list(schema.fields).map(mapField);
	const names = new Map<number, string>();
	const index = (items: IcebergField[], prefix = "") => {
		for (const item of items) {
			if (item.id !== null) names.set(item.id, `${prefix}${item.name}`);
			index(item.children, `${prefix}${item.name}.`);
		}
	};
	index(fields);
	const sourceName = (id: unknown) => names.get(num(id, -1)) ?? `field ${str(id) || num(id)}`;

	const specs = list(raw["partition-specs"]);
	const spec =
		specs.find((s) => num(s["spec-id"], -1) === num(raw["default-spec-id"], -2)) ??
		(specs.length ? specs.at(-1) : { fields: raw["partition-spec"] });
	const partition: IcebergPartitionField[] = list(obj(spec).fields).map((f) => ({
		name: str(f.name),
		sourceName: sourceName(f["source-id"]),
		transform: str(f.transform, "identity"),
		fieldId: nullableNum(f["field-id"]),
	}));

	const orders = list(raw["sort-orders"]);
	const order = orders.find((o) => num(o["order-id"], -1) === num(raw["default-sort-order-id"], -2));
	const sortOrder: IcebergSortField[] = list(order?.fields).map((f) => ({
		sourceName: sourceName(f["source-id"]),
		transform: str(f.transform, "identity"),
		direction: str(f.direction, "asc"),
		nullOrder: str(f["null-order"], "nulls-first"),
	}));

	const currentId = idString(raw["current-snapshot-id"]);
	const current = currentId && currentId !== "-1" ? currentId : null;
	const snapshots: IcebergSnapshot[] = list(raw.snapshots)
		.map((s) => {
			const summary = Object.fromEntries(Object.entries(obj(s.summary)).map(([k, v]) => [k, String(v)]));
			const id = idString(s["snapshot-id"]) ?? "";
			return {
				id,
				parentId: idString(s["parent-snapshot-id"]),
				sequenceNumber: nullableNum(s["sequence-number"]),
				timestamp: msTime(s["timestamp-ms"]),
				operation: summary.operation ?? "unknown",
				summary,
				manifestList: str(s["manifest-list"]) || null,
				schemaId: nullableNum(s["schema-id"]),
				current: id === current,
			};
		})
		.sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""));

	const refs = Object.entries(obj(raw.refs)).map(([name, ref]) => ({
		name,
		type: str(obj(ref).type, "branch"),
		snapshotId: idString(obj(ref)["snapshot-id"]) ?? "",
	}));

	return {
		formatVersion: nullableNum(raw["format-version"]),
		uuid: str(raw["table-uuid"]) || null,
		location: str(raw.location) || null,
		lastUpdated: msTime(raw["last-updated-ms"]),
		currentSnapshotId: current,
		schemaId: schemaId ?? nullableNum(schema["schema-id"]),
		schemaCount: Math.max(schemas.length, fields.length ? 1 : 0),
		fields,
		partition,
		sortOrder,
		properties: Object.fromEntries(Object.entries(obj(raw.properties)).map(([k, v]) => [k, String(v)])),
		snapshots,
		refs,
		metrics: metrics(list(raw.snapshots).find((s) => idString(s["snapshot-id"]) === current)),
		metadataLog: list(raw["metadata-log"])
			.map((m) => ({ file: str(m["metadata-file"]), timestamp: msTime(m["timestamp-ms"]) }))
			.reverse(),
	};
}

/** `s3://bucket/key` (or s3a://) -> the filer path where SeaweedFS stores it. */
export function filerPathForLocation(location: string): string | null {
	const match = /^s3a?:\/\/([^/]+)(\/.*)?$/.exec(location);
	if (match) return `/buckets/${match[1]}${match[2] ?? ""}`;
	return location.startsWith("/") ? location : null;
}
