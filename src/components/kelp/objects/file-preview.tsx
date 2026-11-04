import type { FileDetails } from "@shared/objects.ts";
import { useQuery } from "@tanstack/react-query";
import { Download, FileQuestion, Plus, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { CopyButton } from "@/components/kelp/copy-button.tsx";
import { ErrorState, SkeletonBlock } from "@/components/kelp/page.tsx";
import { FileType, getFileType } from "@/components/reui/file-type";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { formatBytes, formatDateTime } from "@/lib/format.ts";
import { useAction } from "@/lib/mutations.ts";
import { contentUrl, objectApi, objectKeys, objectQueries, s3Url } from "@/lib/objects-queries.ts";
import { useCanWrite } from "@/lib/session.ts";

/** Bytes of a text file Kelp loads for preview. */
export const TEXT_PREVIEW_BYTES = 256 * 1024;

const TEXT_TYPES = /^(text\/|application\/(json|xml|yaml|x-yaml|javascript|x-sh|toml|sql|x-ndjson))/;
const TEXT_EXTENSIONS =
	/\.(txt|md|markdown|json|ya?ml|toml|ini|conf|cfg|log|csv|tsv|xml|html?|css|js|mjs|ts|tsx|jsx|py|go|rs|rb|java|kt|sh|sql|env|gitignore|dockerfile)$/i;

export type PreviewKind = "image" | "video" | "audio" | "pdf" | "text" | "none";

/** How Kelp can show a file, from its MIME type and name. */
export function previewKind(file: { name: string; mime: string; isDirectory: boolean }): PreviewKind {
	if (file.isDirectory) return "none";
	const mime = file.mime.toLowerCase();
	if (mime.startsWith("image/")) return "image";
	if (mime.startsWith("video/")) return "video";
	if (mime.startsWith("audio/")) return "audio";
	if (mime === "application/pdf") return "pdf";
	if (TEXT_TYPES.test(mime) || TEXT_EXTENSIONS.test(file.name)) return "text";
	if (!mime) {
		const type = getFileType(file.name);
		if (["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"].includes(type)) return "image";
		if (["mp4", "webm", "mov"].includes(type)) return "video";
		if (["mp3", "wav", "ogg", "flac", "m4a"].includes(type)) return "audio";
		if (type === "pdf") return "pdf";
	}
	return "none";
}

/** Pretty-prints JSON when the whole document was loaded; otherwise returns the text as is. */
export function formatText(text: string, name: string, complete: boolean): string {
	if (complete && /\.json$/i.test(name)) {
		try {
			return JSON.stringify(JSON.parse(text), null, 2);
		} catch {
			return text;
		}
	}
	return text;
}

/** Unix permission bits as `rwxr-xr-x`. */
export function permissionString(mode: number): string {
	return [6, 3, 0]
		.map((shift) => {
			const bits = (mode >> shift) & 7;
			return `${bits & 4 ? "r" : "-"}${bits & 2 ? "w" : "-"}${bits & 1 ? "x" : "-"}`;
		})
		.join("");
}

/** A TTL in seconds, in the largest whole unit. */
export function formatTtl(seconds: number): string {
	if (seconds <= 0) return "Never";
	const units: Array<[number, string]> = [
		[365 * 86400, "year"],
		[30 * 86400, "month"],
		[7 * 86400, "week"],
		[86400, "day"],
		[3600, "hour"],
		[60, "minute"],
	];
	for (const [size, unit] of units) {
		if (seconds % size === 0) {
			const count = seconds / size;
			return `${count} ${unit}${count === 1 ? "" : "s"}`;
		}
	}
	return `${seconds} seconds`;
}

function TextPreview({ file }: { file: FileDetails }) {
	const complete = file.size <= TEXT_PREVIEW_BYTES;
	const { data, isPending, error } = useQuery({
		queryKey: [...objectKeys.entry(file.path), "text", file.modifiedAt],
		queryFn: async () => {
			const response = await fetch(contentUrl(file.path), {
				headers: complete ? {} : { range: `bytes=0-${TEXT_PREVIEW_BYTES - 1}` },
			});
			if (!response.ok) throw new Error(`Could not load the file (${response.status})`);
			return response.text();
		},
	});
	if (isPending) return <SkeletonBlock className="h-48 rounded-lg" />;
	if (error) return <ErrorState error={error} />;
	return (
		<div className="grid gap-2">
			<pre className="max-h-[50svh] overflow-auto rounded-lg bg-muted/60 p-3 font-mono text-xs leading-relaxed [font-variant-ligatures:none]">
				{formatText(data, file.name, complete)}
			</pre>
			{!complete && (
				<p className="text-muted-foreground text-xs">
					Showing the first {formatBytes(TEXT_PREVIEW_BYTES)} of {formatBytes(file.size)}.
				</p>
			)}
		</div>
	);
}

function Preview({ file }: { file: FileDetails }) {
	const kind = previewKind(file);
	const src = contentUrl(file.path);
	switch (kind) {
		case "image":
			return (
				<div className="flex justify-center rounded-lg bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:16px_16px] p-2">
					<img src={src} alt={file.name} className="max-h-[50svh] max-w-full rounded object-contain" />
				</div>
			);
		case "video":
			return (
				// biome-ignore lint/a11y/useMediaCaption: stored files have no caption track to offer.
				<video src={src} controls className="max-h-[50svh] w-full rounded-lg bg-black" />
			);
		case "audio":
			return (
				// biome-ignore lint/a11y/useMediaCaption: stored files have no caption track to offer.
				<audio src={src} controls className="w-full" />
			);
		case "pdf":
			return <iframe src={src} title={file.name} className="h-[60svh] w-full rounded-lg border" />;
		case "text":
			return <TextPreview file={file} />;
		default:
			return (
				<div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center text-muted-foreground text-sm">
					<FileQuestion className="size-5" />
					Kelp cannot preview this type of file. Download it to open it.
				</div>
			);
	}
}

function Property({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="grid grid-cols-[7rem_1fr] gap-3 py-1.5 text-sm">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="min-w-0 break-words">{children}</dd>
		</div>
	);
}

type TagRow = { key: string; value: string };

function TagsEditor({ file }: { file: FileDetails }) {
	const canWrite = useCanWrite();
	const initial = Object.entries(file.tags).map(([key, value]) => ({ key, value }));
	const [rows, setRows] = useState<TagRow[]>(initial);
	useEffect(() => setRows(Object.entries(file.tags).map(([key, value]) => ({ key, value }))), [file.tags]);
	const save = useAction({
		run: (tags: Record<string, string>) => objectApi.setTags(file.path, tags),
		success: "Tags saved",
		invalidate: [objectKeys.entry(file.path)],
	});
	const keysValid = rows.every((row) => /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/.test(row.key));
	const dirty = JSON.stringify(rows) !== JSON.stringify(initial);

	if (!canWrite && rows.length === 0) return <p className="text-muted-foreground text-sm">No tags.</p>;
	return (
		<div className="grid gap-2">
			{rows.map((row, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: rows are edited in place and have no identity.
				<div key={index} className="flex gap-2">
					<Input
						aria-label="Tag key"
						value={row.key}
						placeholder="key"
						disabled={!canWrite}
						className="font-mono"
						onChange={(event) =>
							setRows(rows.map((r, i) => (i === index ? { ...r, key: event.target.value } : r)))
						}
					/>
					<Input
						aria-label="Tag value"
						value={row.value}
						placeholder="value"
						disabled={!canWrite}
						onChange={(event) =>
							setRows(rows.map((r, i) => (i === index ? { ...r, value: event.target.value } : r)))
						}
					/>
					{canWrite && (
						<Button
							variant="ghost"
							size="icon"
							aria-label={`Remove tag ${row.key}`}
							onClick={() => setRows(rows.filter((_, i) => i !== index))}
						>
							<X />
						</Button>
					)}
				</div>
			))}
			{canWrite && (
				<div className="flex flex-wrap items-center gap-2">
					<Button variant="outline" size="sm" onClick={() => setRows([...rows, { key: "", value: "" }])}>
						<Plus />
						Add tag
					</Button>
					{dirty && (
						<Button
							size="sm"
							disabled={!keysValid || save.isPending}
							onClick={() => save.mutate(Object.fromEntries(rows.map((r) => [r.key, r.value])))}
						>
							{save.isPending && <Spinner />}
							Save tags
						</Button>
					)}
					{!keysValid && (
						<span className="text-destructive text-xs">Keys use letters, numbers and hyphens.</span>
					)}
				</div>
			)}
		</div>
	);
}

function Details({ file, s3Endpoint }: { file: FileDetails; s3Endpoint: string | null | undefined }) {
	const url = s3Url(s3Endpoint, file.path);
	return (
		<div className="grid gap-6 px-4 pb-6">
			<Preview file={file} />
			<div className="flex flex-wrap gap-2">
				<Button render={<a href={contentUrl(file.path, true)} download={file.name} />}>
					<Download />
					Download
				</Button>
			</div>
			<section>
				<h3 className="mb-1 font-medium text-sm">Properties</h3>
				<dl className="divide-y">
					<Property label="Path">
						<span className="flex min-w-0 items-start justify-between gap-1">
							<span className="min-w-0 break-all font-mono text-xs">{file.path}</span>
							<CopyButton value={file.path} label="Copy path" />
						</span>
					</Property>
					{url && (
						<Property label="S3 URL">
							<span className="flex min-w-0 items-start justify-between gap-1">
								<span className="min-w-0 break-all font-mono text-xs">{url}</span>
								<CopyButton value={url} label="Copy S3 URL" />
							</span>
						</Property>
					)}
					<Property label="Size">
						<span className="tabular">
							{formatBytes(file.size)} ({file.size.toLocaleString("en-US")} bytes)
						</span>
					</Property>
					<Property label="Type">{file.mime || "Unknown"}</Property>
					<Property label="Modified">{formatDateTime(file.modifiedAt)}</Property>
					<Property label="Created">{formatDateTime(file.createdAt)}</Property>
					<Property label="Expires">{formatTtl(file.ttlSeconds)}</Property>
					<Property label="Permissions">
						<span className="font-mono text-xs">
							{permissionString(file.mode)}, owner {file.uid}, group {file.gid}
						</span>
					</Property>
					{file.md5 && (
						<Property label="MD5">
							<span className="break-all font-mono text-xs">{file.md5}</span>
						</Property>
					)}
					{file.remote && <Property label="Storage">Remote (tiered)</Property>}
				</dl>
			</section>
			{file.versions.length > 0 && (
				<section aria-labelledby="versions-heading">
					<h3 id="versions-heading" className="mb-2 font-medium text-sm">
						Versions
					</h3>
					<ol className="divide-y rounded-lg border text-xs">
						{file.versions.map((version) => (
							<li key={version.versionId} className="flex items-center gap-3 px-3 py-2">
								<span className="min-w-0 flex-1">
									<span className="block truncate font-mono">{version.versionId}</span>
									<span className="text-muted-foreground">{formatDateTime(version.modifiedAt)}</span>
								</span>
								{version.isLatest && <Badge variant="secondary">Current</Badge>}
								{version.isDeleteMarker ? (
									<span className="text-muted-foreground">Delete marker</span>
								) : (
									<>
										<span className="text-muted-foreground tabular">{formatBytes(version.size)}</span>
										<Button
											variant="ghost"
											size="icon-xs"
											aria-label={`Download version ${version.versionId}`}
											render={
												<a href={contentUrl(file.path, true, version.versionId)} download={file.name} />
											}
										>
											<Download />
										</Button>
									</>
								)}
							</li>
						))}
					</ol>
				</section>
			)}
			{file.chunkList.length > 0 && (
				<section>
					<h3 className="mb-2 font-medium text-sm">
						Chunks <span className="text-muted-foreground">({file.chunkList.length})</span>
					</h3>
					<ul className="max-h-48 divide-y overflow-auto rounded-lg border text-xs">
						{file.chunkList.map((chunk) => (
							<li key={chunk.fileId} className="flex items-center justify-between gap-3 px-3 py-1.5">
								<span className="font-mono">{chunk.fileId}</span>
								<span className="text-muted-foreground tabular">
									{formatBytes(chunk.size)} in volume {chunk.volumeId}
								</span>
							</li>
						))}
					</ul>
				</section>
			)}
			{Object.keys(file.attributes).length > 0 && (
				<section>
					<h3 className="mb-1 font-medium text-sm">Attributes</h3>
					<dl className="divide-y">
						{Object.entries(file.attributes).map(([key, value]) => (
							<Property key={key} label={key}>
								<span className="break-all font-mono text-xs">{value}</span>
							</Property>
						))}
					</dl>
				</section>
			)}
			{Object.keys(file.s3Tags).length > 0 && (
				<section aria-labelledby="s3-tags-heading">
					<h3 id="s3-tags-heading" className="mb-1 font-medium text-sm">
						S3 object tags
					</h3>
					<dl className="divide-y">
						{Object.entries(file.s3Tags).map(([key, value]) => (
							<Property key={key} label={key}>
								{value}
							</Property>
						))}
					</dl>
				</section>
			)}
			<section>
				<h3 className="mb-2 font-medium text-sm">Tags</h3>
				<TagsEditor file={file} />
			</section>
		</div>
	);
}

/** Side sheet with a preview, properties and tags for one file. */
export function FilePreviewSheet({ path, onClose }: { path: string | null; onClose: () => void }) {
	const { data, isPending, error, refetch } = useQuery({
		...objectQueries.entry(path ?? ""),
		enabled: path !== null,
	});
	const { data: s3Endpoint } = useQuery(objectQueries.s3Endpoint());
	const name = path?.slice(path.lastIndexOf("/") + 1) ?? "";
	return (
		<Sheet open={path !== null} onOpenChange={(open) => !open && onClose()}>
			<SheetContent className="w-full gap-0 overflow-x-hidden overflow-y-auto sm:max-w-xl">
				<SheetHeader className="flex-row items-center gap-3 pr-12">
					<FileType type={getFileType(name)} size="sm" aria-hidden="true" />
					<div className="min-w-0">
						<SheetTitle className="truncate">{name}</SheetTitle>
						<SheetDescription className="truncate font-mono text-xs">{path}</SheetDescription>
					</div>
				</SheetHeader>
				{isPending ? (
					<div className="grid gap-3 px-4">
						<SkeletonBlock className="h-56 rounded-lg" />
						<SkeletonBlock className="h-40 rounded-lg" />
					</div>
				) : error ? (
					<div className="px-4">
						<ErrorState error={error} onRetry={() => refetch()} />
					</div>
				) : (
					<Details file={data} s3Endpoint={s3Endpoint} />
				)}
			</SheetContent>
		</Sheet>
	);
}
