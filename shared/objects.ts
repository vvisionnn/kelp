/** Contract types for the object store area: S3 buckets and the filer file browser. */

export type Versioning = "Enabled" | "Suspended" | "Off";
export type ObjectLockMode = "GOVERNANCE" | "COMPLIANCE";

export interface Bucket {
	name: string;
	createdAt: string | null;
	modifiedAt: string | null;
	/** Bytes of object data. */
	logicalSize: number;
	/** Bytes the bucket's volumes occupy on disk, including replicas. */
	physicalSize: number;
	/** Files stored in the bucket's collection, or null when it has no volumes yet. */
	storedFiles: number | null;
	volumes: number;
	quota: { enabled: boolean; bytes: number };
	/** SeaweedFS marks a bucket read-only, for example when it goes over quota. */
	readOnly: boolean;
	/** S3 identity that owns the bucket; empty means admin-only access. */
	owner: string;
	versioning: Versioning;
	objectLock: { enabled: boolean; mode: ObjectLockMode | null; retentionDays: number | null };
	lifecycle: { rules: number; enabled: number };
	policyStatements: number;
}

export interface CreateBucketRequest {
	name: string;
	owner: string;
	/** Quota in bytes, or null for no quota. */
	quotaBytes: number | null;
	versioning: boolean;
	/** Object lock needs versioning; `retentionDays` sets a default retention. */
	objectLock: { mode: ObjectLockMode; retentionDays: number | null } | null;
}

export interface LifecycleRule {
	id: string;
	enabled: boolean;
	/** Applies to keys starting with this prefix; empty means the whole bucket. */
	prefix: string;
	tags: Record<string, string>;
	sizeGreaterThan: number | null;
	sizeLessThan: number | null;
	expirationDays: number | null;
	/** YYYY-MM-DD. Mutually exclusive with `expirationDays`. */
	expirationDate: string | null;
	expiredDeleteMarkers: boolean;
	noncurrentExpirationDays: number | null;
	newerNoncurrentVersions: number | null;
	abortMultipartDays: number | null;
}

export interface BucketPolicy {
	/** The parsed policy document, or null when the bucket has none. */
	policy: Record<string, unknown> | null;
	/** Stored text SeaweedFS could not parse, so it can be fixed or removed. */
	invalidText: string | null;
}

export interface FileEntry {
	name: string;
	path: string;
	isDirectory: boolean;
	size: number;
	mime: string;
	modifiedAt: string | null;
	createdAt: string | null;
	/** Unix permission bits (without the directory flag). */
	mode: number;
	ttlSeconds: number;
	/** Hex MD5 of the content, when the filer has it. */
	md5: string | null;
	chunks: number;
	symlinkTarget: string | null;
}

export interface FileListing {
	path: string;
	entries: FileEntry[];
	/** Pass back as `cursor` to load the next page; null on the last page. */
	nextCursor: string | null;
}

export interface FileChunk {
	fileId: string;
	volumeId: number;
	size: number;
	modifiedAt: string | null;
}

export interface FileDetails extends FileEntry {
	uid: number;
	gid: number;
	/** User tags (the filer's `Seaweed-` attributes) without the prefix. */
	tags: Record<string, string>;
	/** Other extended attributes, decoded when they are text. */
	attributes: Record<string, string>;
	chunkList: FileChunk[];
	/** Content lives in remote storage (tiered/mounted). */
	remote: boolean;
}

export interface DeleteResult {
	deleted: string[];
	failed: Array<{ path: string; error: string }>;
}
