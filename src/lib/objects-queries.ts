import type {
	Bucket,
	BucketPolicy,
	CreateBucketRequest,
	DeleteResult,
	FileDetails,
	FileListing,
	LifecycleRule,
} from "@shared/objects.ts";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { ApiError, api, UNAUTHORIZED_EVENT } from "./api.ts";

const LIVE = 15_000;
const PAGE_SIZE = 200;

export const objectKeys = {
	buckets: ["buckets"] as const,
	bucket: (name: string) => ["buckets", name] as const,
	files: ["files"] as const,
	folder: (path: string) => ["files", "list", path] as const,
	entry: (path: string) => ["files", "entry", path] as const,
};

/** Query definitions for buckets and the file browser. */
export const objectQueries = {
	buckets: () =>
		queryOptions({
			queryKey: objectKeys.buckets,
			queryFn: async () => (await api.get<{ buckets: Bucket[] }>("/buckets")).buckets,
			refetchInterval: LIVE,
		}),
	bucket: (name: string) =>
		queryOptions({
			queryKey: [...objectKeys.bucket(name), "details"],
			queryFn: async () => (await api.get<{ bucket: Bucket }>(`/buckets/${encodeURIComponent(name)}`)).bucket,
			refetchInterval: LIVE,
		}),
	lifecycle: (name: string) =>
		queryOptions({
			queryKey: [...objectKeys.bucket(name), "lifecycle"],
			queryFn: async () =>
				(await api.get<{ rules: LifecycleRule[] }>(`/buckets/${encodeURIComponent(name)}/lifecycle`)).rules,
		}),
	policy: (name: string) =>
		queryOptions({
			queryKey: [...objectKeys.bucket(name), "policy"],
			queryFn: () => api.get<BucketPolicy>(`/buckets/${encodeURIComponent(name)}/policy`),
		}),
	owners: () =>
		queryOptions({
			queryKey: ["bucket-owners"],
			queryFn: async () => (await api.get<{ owners: string[] }>("/bucket-owners")).owners,
			staleTime: 60_000,
		}),
	folder: (path: string) =>
		infiniteQueryOptions({
			queryKey: objectKeys.folder(path),
			queryFn: ({ pageParam }) =>
				api.get<FileListing>("/files/list", { path, limit: PAGE_SIZE, cursor: pageParam || undefined }),
			initialPageParam: "",
			getNextPageParam: (page) => page.nextCursor ?? undefined,
		}),
	entry: (path: string) =>
		queryOptions({
			queryKey: objectKeys.entry(path),
			queryFn: () => api.get<FileDetails>("/files/entry", { path }),
		}),
	/** Kelp's public S3 endpoint, used to build object URLs. */
	s3Endpoint: () =>
		queryOptions({
			queryKey: ["system", "config"],
			queryFn: async () =>
				(await api.get<{ kelp: { s3Endpoint: string | null } }>("/system/config")).kelp.s3Endpoint,
			staleTime: 5 * 60_000,
		}),
};

export const objectApi = {
	createBucket: (input: CreateBucketRequest) => api.post<{ name: string }>("/buckets", input),
	deleteBucket: (name: string) => api.delete(`/buckets/${encodeURIComponent(name)}`),
	setQuota: (name: string, quota: { enabled: boolean; bytes: number }) =>
		api.put(`/buckets/${encodeURIComponent(name)}/quota`, quota),
	setOwner: (name: string, owner: string) => api.put(`/buckets/${encodeURIComponent(name)}/owner`, { owner }),
	setLifecycle: (name: string, rules: LifecycleRule[]) =>
		api.put(`/buckets/${encodeURIComponent(name)}/lifecycle`, { rules }),
	setPolicy: (name: string, policy: Record<string, unknown>) =>
		api.put(`/buckets/${encodeURIComponent(name)}/policy`, { policy }),
	deletePolicy: (name: string) => api.delete(`/buckets/${encodeURIComponent(name)}/policy`),
	createFolder: (parent: string, name: string) =>
		api.post<{ path: string }>("/files/folder", { parent, name }),
	move: (from: string, to: string) => api.post<{ path: string }>("/files/move", { from, to }),
	remove: (paths: string[]) => api.post<DeleteResult>("/files/delete", { paths }),
	setTags: (path: string, tags: Record<string, string>) =>
		api.put<FileDetails>("/files/tags", { path, tags }),
};

/** URL that streams a file through Kelp; `download` asks the browser to save it. */
export function contentUrl(path: string, download = false): string {
	const params = new URLSearchParams({ path });
	if (download) params.set("download", "1");
	return `/api/files/content?${params}`;
}

/** Joins a folder and a child name into a filer path. */
export function joinPath(dir: string, name: string): string {
	return dir === "/" ? `/${name}` : `${dir}/${name}`;
}

export function parentPath(path: string): string {
	return path.slice(0, path.lastIndexOf("/")) || "/";
}

/** The S3 URL of an object stored under `/buckets/<bucket>/`, or null for other paths. */
export function s3Url(endpoint: string | null | undefined, path: string): string | null {
	const match = /^\/buckets\/([^/]+)\/(.+)$/.exec(path);
	if (!endpoint || !match) return null;
	const key = (match[2] ?? "").split("/").map(encodeURIComponent).join("/");
	return `${endpoint.replace(/\/+$/, "")}/${match[1]}/${key}`;
}

export interface UploadOptions {
	ttl?: string;
	onProgress?: (fraction: number) => void;
	signal?: AbortSignal;
}

/**
 * Uploads one file with progress. Uses XMLHttpRequest because fetch cannot report upload progress.
 * Resolves with the stored path; rejects with an `ApiError` carrying the server's message.
 */
export function uploadFile(dir: string, file: File, options: UploadOptions = {}): Promise<string> {
	const params = new URLSearchParams({ path: dir, name: file.name });
	if (options.ttl) params.set("ttl", options.ttl);
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open("POST", `/api/files/upload?${params}`);
		xhr.setRequestHeader("x-kelp-csrf", "1");
		xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
		xhr.upload.onprogress = (event) => {
			if (event.lengthComputable) options.onProgress?.(event.loaded / event.total);
		};
		xhr.onload = () => {
			let body: { path?: string; error?: string; upstream?: string } = {};
			try {
				body = JSON.parse(xhr.responseText);
			} catch {
				// not JSON
			}
			if (xhr.status >= 200 && xhr.status < 300) {
				options.onProgress?.(1);
				resolve(body.path ?? joinPath(dir, file.name));
			} else {
				if (xhr.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
				reject(new ApiError(xhr.status, body.error || `Upload failed (${xhr.status})`, body.upstream));
			}
		};
		xhr.onerror = () => reject(new ApiError(0, "Kelp server is unreachable"));
		xhr.onabort = () => reject(new ApiError(0, "Upload cancelled"));
		options.signal?.addEventListener("abort", () => xhr.abort());
		xhr.send(file);
	});
}
