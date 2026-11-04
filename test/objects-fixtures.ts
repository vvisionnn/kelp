import type { Bucket, FileDetails, FileEntry, LifecycleRule } from "@shared/objects.ts";
import { collectionStats, mapBucket, mapDetails, mapEntry, mapLifecycleRule } from "../server/map/objects.ts";
import type { ApiCall } from "./render-app.tsx";
import { fixture } from "./render-app.tsx";

type Raw = Record<string, unknown>;

export function entry(path: string, patch: Partial<FileEntry> = {}): FileEntry {
	return {
		name: path.slice(path.lastIndexOf("/") + 1),
		path,
		isDirectory: false,
		size: 1024,
		mime: "text/plain",
		modifiedAt: "2026-11-04T10:00:00.000Z",
		createdAt: "2026-11-04T10:00:00.000Z",
		mode: 0o660,
		ttlSeconds: 0,
		md5: null,
		chunks: 1,
		symlinkTarget: null,
		...patch,
	};
}

export function details(path: string, patch: Partial<FileDetails> = {}): FileDetails {
	return {
		...entry(path),
		uid: 501,
		gid: 20,
		tags: {},
		attributes: {},
		chunkList: [{ fileId: "3,01abc", volumeId: 3, size: 1024, modifiedAt: null }],
		remote: false,
		...patch,
	};
}

/** API responses for the object store pages, built from captured SeaweedFS fixtures. */
export async function objectsApi() {
	const stats = collectionStats(await fixture("master/vol-status"));
	const buckets: Bucket[] = (await fixture<{ buckets: Raw[] }>("admin/buckets-all")).buckets.map((b) =>
		mapBucket(b, stats.get(String(b.name))),
	);
	const byName = (name: string) => buckets.find((b) => b.name === name) as Bucket;
	const lifecycle: LifecycleRule[] = (
		await fixture<{ rules: Raw[] }>("admin/bucket-lifecycle-rules")
	).rules.map(mapLifecycleRule);
	const policy = (await fixture<{ policy: Record<string, unknown> }>("admin/bucket-policy-set")).policy;
	const tagged = mapDetails(await fixture("filer/meta-tagged"));
	const pageOne = (await fixture<{ Entries: Raw[] }>("filer/list-page1")).Entries.map(mapEntry);
	const pageTwo = (await fixture<{ Entries: Raw[] }>("filer/list-page2")).Entries.map(mapEntry);

	const folders: Record<string, FileEntry[]> = {
		"/": [
			entry("/buckets", { isDirectory: true, size: 0 }),
			entry("/projects", { isDirectory: true, size: 0 }),
		],
		"/projects": [entry("/projects/kelp", { isDirectory: true, size: 0 })],
		"/buckets/media": [
			entry("/buckets/media/photos", { isDirectory: true, size: 0 }),
			entry("/buckets/media/config.json", { mime: "application/json", size: 63 }),
			entry("/buckets/media/README.md", { mime: "", size: 57 }),
		],
		"/buckets/archive": [],
	};

	const routes = {
		"GET /buckets": { buckets },
		"GET /bucket-owners": { owners: ["admin", "ci-bot"] },
		"GET /system/config": { kelp: { s3Endpoint: "https://s3.example.com", version: "0.0.0" } },
		"GET /buckets/archive": { bucket: byName("archive") },
		"GET /buckets/media": { bucket: byName("media") },
		"GET /buckets/backups": { bucket: byName("backups") },
		"GET /buckets/archive/lifecycle": { rules: lifecycle },
		"GET /buckets/media/lifecycle": { rules: [] },
		"GET /buckets/archive/policy": { policy, invalidText: null },
		"GET /buckets/media/policy": { policy: null, invalidText: null },
		"GET /files/list": (call: ApiCall) => {
			const path = call.query.get("path") ?? "/";
			if (path === "/projects/kelp") {
				return call.query.get("cursor")
					? { path, entries: pageTwo, nextCursor: null }
					: { path, entries: pageOne, nextCursor: "docs" };
			}
			const entries = folders[path];
			return entries
				? { path, entries, nextCursor: null }
				: Response.json({ error: `The folder ${path} does not exist`, upstream: "filer" }, { status: 404 });
		},
		"GET /files/entry": (call: ApiCall) => {
			const path = call.query.get("path") ?? "";
			if (path === "/projects/kelp/notes.txt") return tagged;
			if (path.endsWith(".json")) return details(path, { mime: "application/json", size: 63 });
			return details(path);
		},
	};
	return { buckets, byName, lifecycle, policy, tagged, pageOne, pageTwo, routes };
}
