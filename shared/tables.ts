export interface TableBucket {
	arn: string;
	name: string;
	owner: string;
	format: string;
	createdAt: string | null;
	policyStatements: number;
}

export interface TableBucketList {
	buckets: TableBucket[];
	/** Port of the Iceberg REST catalog as configured on the admin, when known. */
	icebergPort: number | null;
}

export interface TableNamespace {
	/** Dotted name, e.g. `sales` or `sales.emea`. */
	name: string;
	parts: string[];
	createdAt: string | null;
}

export interface TableSummary {
	name: string;
	arn: string;
	namespace: string;
	format: string;
	createdAt: string | null;
	modifiedAt: string | null;
	metadataLocation: string | null;
}

export interface TableBucketDetail {
	bucket: TableBucket;
	namespaces: TableNamespace[];
	tables: TableSummary[];
	tags: Record<string, string>;
	policy: string;
}

export interface IcebergField {
	id: number | null;
	name: string;
	/** Readable type, e.g. `long`, `decimal(10,2)`, `list<string>`, `struct`. */
	type: string;
	required: boolean;
	doc: string | null;
	children: IcebergField[];
}

export interface IcebergPartitionField {
	name: string;
	sourceName: string;
	transform: string;
	fieldId: number | null;
}

export interface IcebergSortField {
	sourceName: string;
	transform: string;
	direction: string;
	nullOrder: string;
}

export interface IcebergSnapshot {
	/** Snapshot ids are 63-bit integers, kept as strings to stay exact. */
	id: string;
	parentId: string | null;
	sequenceNumber: number | null;
	timestamp: string | null;
	operation: string;
	summary: Record<string, string>;
	manifestList: string | null;
	schemaId: number | null;
	current: boolean;
}

export interface IcebergMetrics {
	records: number | null;
	dataFiles: number | null;
	deleteFiles: number | null;
	totalSize: number | null;
}

export interface IcebergTable {
	formatVersion: number | null;
	uuid: string | null;
	location: string | null;
	lastUpdated: string | null;
	currentSnapshotId: string | null;
	schemaId: number | null;
	schemaCount: number;
	fields: IcebergField[];
	partition: IcebergPartitionField[];
	sortOrder: IcebergSortField[];
	properties: Record<string, string>;
	snapshots: IcebergSnapshot[];
	refs: Array<{ name: string; type: string; snapshotId: string }>;
	metrics: IcebergMetrics;
	metadataLog: Array<{ file: string; timestamp: string | null }>;
}

export interface TableDetail {
	table: TableSummary;
	bucket: string;
	owner: string;
	versionToken: string | null;
	tags: Record<string, string>;
	policy: string;
	/** Parsed Iceberg metadata; null when the table has no readable metadata yet. */
	iceberg: IcebergTable | null;
	/** Why metadata could not be read, when it exists but is unreadable. */
	metadataError: string | null;
}

export interface DataFileInfo {
	path: string;
	format: string;
	records: number;
	size: number;
	partition: Record<string, string | null>;
}

export interface TablePreview {
	snapshotId: string | null;
	files: DataFileInfo[];
	/** The data file the rows come from. */
	file: string | null;
	columns: string[];
	rows: Array<Array<string | null>>;
	hasDeletes: boolean;
	notes: string[];
}

export interface CreateTableField {
	name: string;
	type: string;
	required: boolean;
}

export const ICEBERG_PRIMITIVE_TYPES = [
	"boolean",
	"int",
	"long",
	"float",
	"double",
	"decimal(10,2)",
	"date",
	"time",
	"timestamp",
	"timestamptz",
	"string",
	"uuid",
	"binary",
] as const;
