import type {
	Bucket,
	BucketPolicy,
	FileChunk,
	FileDetails,
	FileEntry,
	LifecycleRule,
	ObjectLockMode,
	ObjectVersion,
	Versioning,
} from "../../shared/objects.ts";
import { bool, list, nanos, num, obj, type Raw, str, time } from "./raw.ts";

export interface CollectionStats {
	files: number;
	volumes: number;
}

/**
 * Live file and volume counts per collection from the master's `/vol/status`. A bucket stores its
 * objects in the collection of the same name. Replicas appear once per server, so each volume id
 * is counted once.
 */
export function collectionStats(volStatus: unknown): Map<string, CollectionStats> {
	const seen = new Set<number>();
	const stats = new Map<string, CollectionStats>();
	const dataCenters = obj(obj(obj(volStatus).Volumes).DataCenters);
	for (const racks of Object.values(dataCenters)) {
		for (const servers of Object.values(obj(racks))) {
			for (const volumes of Object.values(obj(servers))) {
				for (const volume of list(volumes)) {
					const id = num(volume.Id);
					if (seen.has(id)) continue;
					seen.add(id);
					const name = str(volume.Collection);
					const current = stats.get(name) ?? { files: 0, volumes: 0 };
					current.files += Math.max(0, num(volume.FileCount) - num(volume.DeleteCount));
					current.volumes += 1;
					stats.set(name, current);
				}
			}
		}
	}
	return stats;
}

function versioning(value: unknown): Versioning {
	const status = str(value);
	return status === "Enabled" || status === "Suspended" ? status : "Off";
}

function lockMode(value: unknown): ObjectLockMode | null {
	const mode = str(value).toUpperCase();
	return mode === "GOVERNANCE" || mode === "COMPLIANCE" ? mode : null;
}

export function mapBucket(raw: Raw, stats?: CollectionStats): Bucket {
	const lockEnabled = bool(raw.object_lock_enabled);
	const retention = num(raw.object_lock_duration);
	return {
		name: str(raw.name),
		createdAt: time(raw.created_at),
		modifiedAt: time(raw.last_modified),
		logicalSize: num(raw.logical_size),
		physicalSize: num(raw.physical_size),
		storedFiles: stats ? stats.files : null,
		volumes: stats?.volumes ?? 0,
		quota: { enabled: bool(raw.quota_enabled), bytes: num(raw.quota) },
		readOnly: bool(raw.read_only),
		owner: str(raw.owner),
		versioning: versioning(raw.versioning_status),
		objectLock: {
			enabled: lockEnabled,
			mode: lockEnabled ? lockMode(raw.object_lock_mode) : null,
			retentionDays: lockEnabled && retention > 0 ? retention : null,
		},
		lifecycle: { rules: num(raw.lifecycle_rule_count), enabled: num(raw.lifecycle_enabled_count) },
		policyStatements: num(raw.policy_statement_count),
	};
}

const positive = (value: unknown): number | null => {
	const n = num(value);
	return n > 0 ? n : null;
};

function stringMap(value: unknown): Record<string, string> {
	return Object.fromEntries(Object.entries(obj(value)).map(([key, v]) => [key, str(v)]));
}

export function mapLifecycleRule(raw: Raw): LifecycleRule {
	return {
		id: str(raw.id),
		enabled: str(raw.status) === "Enabled",
		prefix: str(raw.prefix),
		tags: stringMap(raw.tags),
		sizeGreaterThan: positive(raw.size_greater_than),
		sizeLessThan: positive(raw.size_less_than),
		expirationDays: positive(raw.expiration_days),
		expirationDate: str(raw.expiration_date) || null,
		expiredDeleteMarkers: bool(raw.expired_object_delete_marker),
		noncurrentExpirationDays: positive(raw.noncurrent_version_expiration_days),
		newerNoncurrentVersions: positive(raw.newer_noncurrent_versions),
		abortMultipartDays: positive(raw.abort_multipart_days),
	};
}

/** The admin API's rule JSON. Zero and empty values are omitted, as SeaweedFS does. */
export function toAdminLifecycleRule(rule: LifecycleRule): Raw {
	const raw: Raw = { status: rule.enabled ? "Enabled" : "Disabled" };
	const set = (key: string, value: unknown) => {
		if (value !== null && value !== "" && value !== false && value !== undefined) raw[key] = value;
	};
	set("id", rule.id.trim());
	set("prefix", rule.prefix);
	if (Object.keys(rule.tags).length > 0) raw.tags = rule.tags;
	set("size_greater_than", rule.sizeGreaterThan);
	set("size_less_than", rule.sizeLessThan);
	set("expiration_days", rule.expirationDays);
	set("expiration_date", rule.expirationDate);
	set("expired_object_delete_marker", rule.expiredDeleteMarkers);
	set("noncurrent_version_expiration_days", rule.noncurrentExpirationDays);
	set("newer_noncurrent_versions", rule.newerNoncurrentVersions);
	set("abort_multipart_days", rule.abortMultipartDays);
	return raw;
}

export function mapPolicy(raw: Raw): BucketPolicy {
	const policy =
		raw.policy && typeof raw.policy === "object" ? (raw.policy as Record<string, unknown>) : null;
	return { policy, invalidText: policy ? null : str(raw.policy_text) || null };
}

// ---------------------------------------------------------------- filer entries

/** The filer's Go `os.ModeDir` bit. */
export function isDirectoryMode(mode: number): boolean {
	return ((mode >>> 31) & 1) === 1;
}

function md5Hex(value: unknown): string | null {
	const encoded = str(value);
	if (!encoded) return null;
	return Buffer.from(encoded, "base64").toString("hex");
}

function baseName(path: string): string {
	if (path === "/") return "/";
	return path.slice(path.lastIndexOf("/") + 1);
}

/** Where S3 keeps the versions of `key` in a versioned bucket. */
export const VERSIONS_SUFFIX = ".versions";
const EXT = {
	versionId: "Seaweed-X-Amz-Version-Id",
	deleteMarker: "Seaweed-X-Amz-Delete-Marker",
	latestFile: "Seaweed-X-Amz-Latest-Version-File-Name",
	latestId: "Seaweed-X-Amz-Latest-Version-Id",
	latestSize: "Seaweed-X-Amz-Latest-Version-Size",
	latestEtag: "Seaweed-X-Amz-Latest-Version-ETag",
	latestMtime: "Seaweed-X-Amz-Latest-Version-Mtime",
	latestDeleted: "Seaweed-X-Amz-Latest-Version-Is-Delete-Marker",
	nullIsLatest: "Seaweed-X-Amz-Null-Version-Is-Latest",
} as const;

/** An extended attribute as text (the filer base64-encodes them). */
export function extended(raw: Raw, key: string): string {
	const value = str(obj(raw.Extended)[key]);
	return value ? Buffer.from(value, "base64").toString("utf8") : "";
}

/** The latest version file inside a `.versions` folder, or null when the object is deleted or not versioned. */
export function latestVersionFile(versionsDir: Raw): string | null {
	if (extended(versionsDir, EXT.latestDeleted) === "true" || extended(versionsDir, EXT.nullIsLatest))
		return null;
	return extended(versionsDir, EXT.latestFile) || null;
}

/**
 * Maps one directory listing entry. A `<key>.versions` folder becomes the object `<key>` (the way S3
 * presents it); a deleted object, or one whose plain file is current, is skipped.
 */
export function mapListEntry(raw: Raw): FileEntry | null {
	const entry = mapEntry(raw);
	if (!entry.isDirectory || !entry.name.endsWith(VERSIONS_SUFFIX) || !extended(raw, EXT.latestFile))
		return entry;
	if (!latestVersionFile(raw)) return null;
	const etag = extended(raw, EXT.latestEtag);
	const seconds = Number(extended(raw, EXT.latestMtime));
	return {
		...entry,
		name: entry.name.slice(0, -VERSIONS_SUFFIX.length),
		path: entry.path.slice(0, -VERSIONS_SUFFIX.length),
		isDirectory: false,
		size: Number(extended(raw, EXT.latestSize)) || 0,
		modifiedAt: seconds > 0 ? new Date(seconds * 1000).toISOString() : entry.modifiedAt,
		md5: /^[0-9a-f]{32}$/.test(etag) ? etag : null,
		versionId: extended(raw, EXT.latestId) || null,
	};
}

/** One version file inside a `.versions` folder. */
export function mapVersion(raw: Raw, latestFile: string): ObjectVersion {
	const entry = mapEntry(raw);
	return {
		versionId: entry.versionId ?? entry.name.replace(/^v_/, ""),
		size: entry.size,
		modifiedAt: entry.modifiedAt,
		md5: entry.md5,
		isLatest: entry.name === latestFile,
		isDeleteMarker: extended(raw, EXT.deleteMarker) === "true",
	};
}

export function mapEntry(raw: Raw): FileEntry {
	const path = str(raw.FullPath);
	const mode = num(raw.Mode);
	const directory = isDirectoryMode(mode);
	return {
		name: baseName(path),
		path,
		isDirectory: directory,
		size: directory ? 0 : num(raw.FileSize),
		mime: str(raw.Mime),
		modifiedAt: time(raw.Mtime),
		createdAt: time(raw.Crtime),
		mode: mode & 0o7777,
		ttlSeconds: num(raw.TtlSec),
		md5: md5Hex(raw.Md5),
		chunks: list(raw.chunks).length,
		symlinkTarget: str(raw.SymlinkTarget) || null,
		versionId: extended(raw, EXT.versionId) || null,
	};
}

/** The filer prefix for user tags set with `?tagging`. */
export const TAG_PREFIX = "Seaweed-";
/** SeaweedFS's own S3 bookkeeping, which shares the tag prefix. */
const S3_INTERNAL_PREFIX = "Seaweed-X-Amz-";
/** Tags set through the S3 PutObjectTagging API. */
const S3_TAG_PREFIX = "X-Amz-Tagging-";

/** True when `text` holds ASCII control characters; tab, newline and carriage return pass when `allowWhitespace`. */
export function hasControlCharacters(text: string, allowWhitespace = false): boolean {
	for (const char of text) {
		const code = char.charCodeAt(0);
		const whitespace = code === 9 || code === 10 || code === 13;
		if ((code < 32 && !(allowWhitespace && whitespace)) || code === 127) return true;
	}
	return false;
}

/** Decodes a base64 attribute value as text when it is printable UTF-8. */
export function decodeAttribute(encoded: string): string {
	const bytes = Buffer.from(encoded, "base64");
	const text = bytes.toString("utf8");
	const printable = !text.includes("\uFFFD") && !hasControlCharacters(text, true);
	return printable ? text : `base64:${encoded}`;
}

function mapChunk(raw: Raw): FileChunk {
	return {
		fileId: str(raw.file_id),
		volumeId: num(obj(raw.fid).volume_id),
		size: num(raw.size),
		modifiedAt: nanos(raw.modified_ts_ns),
	};
}

export function mapDetails(raw: Raw): FileDetails {
	const tags: Record<string, string> = {};
	const s3Tags: Record<string, string> = {};
	const attributes: Record<string, string> = {};
	for (const [key, value] of Object.entries(obj(raw.Extended))) {
		const decoded = decodeAttribute(str(value));
		if (key.startsWith(TAG_PREFIX) && !key.startsWith(S3_INTERNAL_PREFIX))
			tags[key.slice(TAG_PREFIX.length)] = decoded;
		else if (key.startsWith(S3_TAG_PREFIX) && key !== "X-Amz-Tagging-Directive")
			s3Tags[key.slice(S3_TAG_PREFIX.length)] = decoded;
		else attributes[key] = decoded;
	}
	return {
		...mapEntry(raw),
		uid: num(raw.Uid),
		gid: num(raw.Gid),
		tags,
		s3Tags,
		attributes,
		chunkList: list(raw.chunks).map(mapChunk),
		remote: raw.Remote !== null && raw.Remote !== undefined,
		versions: [],
	};
}
