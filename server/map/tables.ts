import type { IcebergTable, TableBucket, TableNamespace, TableSummary } from "../../shared/tables.ts";
import { mapIcebergMetadata, mapSimpleFields } from "../iceberg/metadata.ts";
import { num, obj, type Raw, str, strings, time } from "./raw.ts";

export function mapTableBucket(raw: Raw): TableBucket {
	return {
		arn: str(raw.arn),
		name: str(raw.name),
		owner: str(raw.ownerAccountId),
		format: str(raw.format, "ICEBERG"),
		createdAt: time(raw.createdAt),
		policyStatements: num(raw.policy_statement_count),
	};
}

export function mapNamespace(raw: Raw): TableNamespace {
	const parts = strings(raw.namespace);
	return { name: parts.join("."), parts, createdAt: time(raw.createdAt) };
}

export function mapTableSummary(raw: Raw): TableSummary {
	return {
		name: str(raw.name),
		arn: str(raw.tableARN),
		namespace: strings(raw.namespace).join("."),
		format: str(raw.format, "ICEBERG"),
		createdAt: time(raw.createdAt),
		modifiedAt: time(raw.modifiedAt),
		metadataLocation: str(raw.metadataLocation) || null,
	};
}

/** The table's catalog record that SeaweedFS keeps on its filer entry (`s3tables.metadata`). */
export interface CatalogRecord {
	owner: string;
	versionToken: string | null;
	metadataLocation: string | null;
	/** Iceberg metadata embedded in the record, when the catalog keeps a copy. */
	fullMetadata: Raw | null;
	/** Schema of a table created without Iceberg metadata. */
	simpleFields: unknown;
}

export function catalogRecord(entry: Raw): CatalogRecord {
	const encoded = str(obj(entry.Extended)["s3tables.metadata"]);
	let record: Raw = {};
	try {
		record = obj(JSON.parse(Buffer.from(encoded, "base64").toString("utf8")));
	} catch {
		// Not a table entry, or written by a newer SeaweedFS; treat as empty.
	}
	const metadata = obj(record.metadata);
	const full = obj(metadata.fullMetadata);
	return {
		owner: str(record.ownerAccountId),
		versionToken: str(record.versionToken) || null,
		metadataLocation: str(record.metadataLocation) || null,
		fullMetadata: Object.keys(full).length ? full : null,
		simpleFields: obj(obj(metadata.iceberg).schema).fields,
	};
}

/** A table the catalog knows only by schema: no snapshots, no files. */
export function catalogOnlyTable(fields: unknown): IcebergTable | null {
	const mapped = mapSimpleFields(fields);
	if (!mapped.length) return null;
	const table = mapIcebergMetadata({});
	return { ...table, fields: mapped, schemaCount: 1, formatVersion: null };
}
