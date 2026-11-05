/**
 * Numbers the object store pages derive from what Kelp already has: bucket inventory, sampled S3
 * traffic and folder listings. Pure functions, so every chart on these pages is easy to test.
 */
import type { Bucket, FileEntry } from "@shared/objects.ts";
import type { BucketTraffic, Telemetry, TelemetryPoint } from "@shared/telemetry.ts";
import { formatBytes, ratio } from "@/lib/format.ts";

/** Per-bucket S3 traffic from telemetry, keyed by bucket name. */
export function trafficByBucket(telemetry: Telemetry | undefined): Map<string, BucketTraffic> {
	return new Map((telemetry?.buckets ?? []).map((b) => [b.bucket, b]));
}

/** Failed S3 requests as a share of all requests at each point (0..1), null when idle. */
export function errorShare(points: TelemetryPoint[]): Array<number | null> {
	return points.map((p) => (p.s3.rps > 0 ? (p.s3.clientErrors + p.s3.serverErrors) / p.s3.rps : null));
}

/** Buckets with a quota, fullest first. */
export function quotaUsage(buckets: Bucket[]): Array<{ bucket: Bucket; used: number }> {
	return buckets
		.filter((b) => b.quota.enabled && b.quota.bytes > 0)
		.map((bucket) => ({ bucket, used: ratio(bucket.logicalSize, bucket.quota.bytes) }))
		.sort((a, b) => b.used - a.used);
}

/** Buckets at 80% of their quota or more: the ones about to refuse writes. */
export function nearQuota(buckets: Bucket[]): number {
	return quotaUsage(buckets).filter((q) => q.used >= 0.8).length;
}

/** The largest buckets by object data, the rest folded into "Other" so the ring stays readable. */
export function sizeShares(buckets: Bucket[], limit = 4): Array<{ label: string; value: number }> {
	const sorted = [...buckets].sort((a, b) => b.logicalSize - a.logicalSize).filter((b) => b.logicalSize > 0);
	const top = sorted.slice(0, limit).map((b) => ({ label: b.name, value: b.logicalSize }));
	const rest = sorted.slice(limit).reduce((sum, b) => sum + b.logicalSize, 0);
	return rest > 0 ? [...top, { label: "Other", value: rest }] : top;
}

/** Size buckets as labelled columns; the open-ended last bucket (`le: -1`) reads "larger". */
export function sizeColumns(buckets: Telemetry["objectSizes"]): Array<{ label: string; value: number }> {
	const finite = buckets.filter((b) => b.le >= 0).sort((a, b) => a.le - b.le);
	const columns = finite.map((b) => ({ label: `≤${formatBytes(b.le).replace(" ", "")}`, value: b.count }));
	const rest = buckets.find((b) => b.le < 0);
	const last = finite.at(-1);
	if (rest && last) columns.push({ label: `>${formatBytes(last.le).replace(" ", "")}`, value: rest.count });
	return columns;
}

/** What kind of file an entry is, in words an operator uses. */
export type FileKind =
	| "Images"
	| "Video & audio"
	| "Documents"
	| "Data"
	| "Logs"
	| "Archives"
	| "Code"
	| "Other";

const KINDS: Array<[FileKind, RegExp]> = [
	["Images", /\.(png|jpe?g|gif|webp|svg|avif|heic|bmp|tiff?)$/i],
	["Video & audio", /\.(mp4|mov|webm|mkv|avi|mp3|wav|flac|ogg|m4a)$/i],
	["Documents", /\.(pdf|docx?|xlsx?|pptx?|md|txt|rtf|odt)$/i],
	["Data", /\.(csv|tsv|json|ndjson|parquet|avro|orc|xml|ya?ml)$/i],
	["Logs", /\.(log|log\.gz|out)$/i],
	["Archives", /\.(zip|tar|tgz|gz|bz2|xz|7z|zst|tar\.gz)$/i],
	["Code", /\.(js|ts|tsx|py|go|rs|java|sh|html|css|sql)$/i],
];

export function fileKind(name: string): FileKind {
	for (const [kind, pattern] of KINDS) if (pattern.test(name)) return kind;
	return "Other";
}

export interface FolderStats {
	folders: number;
	files: number;
	bytes: number;
	newest: FileEntry | null;
	/** Bytes by file kind, largest first. */
	kinds: Array<{ kind: FileKind; bytes: number; files: number }>;
	/** The five largest files. */
	largest: FileEntry[];
}

/** A summary of one folder's listing: what is in it, how big, and what changed last. */
export function folderStats(entries: FileEntry[]): FolderStats {
	const files = entries.filter((e) => !e.isDirectory);
	const kinds = new Map<FileKind, { bytes: number; files: number }>();
	for (const file of files) {
		const kind = fileKind(file.name);
		const current = kinds.get(kind) ?? { bytes: 0, files: 0 };
		kinds.set(kind, { bytes: current.bytes + file.size, files: current.files + 1 });
	}
	let newest: FileEntry | null = null;
	for (const entry of entries) {
		if (entry.modifiedAt && (!newest?.modifiedAt || entry.modifiedAt > newest.modifiedAt)) newest = entry;
	}
	return {
		folders: entries.length - files.length,
		files: files.length,
		bytes: files.reduce((sum, f) => sum + f.size, 0),
		newest,
		kinds: [...kinds].map(([kind, v]) => ({ kind, ...v })).sort((a, b) => b.bytes - a.bytes),
		largest: [...files].sort((a, b) => b.size - a.size).slice(0, 5),
	};
}
