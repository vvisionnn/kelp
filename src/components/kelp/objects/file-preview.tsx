import type { FileDetails } from "@shared/objects.ts";
import { useQuery } from "@tanstack/react-query";
import { Download, FileQuestion, Plus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { CopyButton } from "@/components/kelp/copy-button.tsx";
import { EASE, SPEED, usePrefersReducedMotion } from "@/components/kelp/motion.ts";
import { SkeletonBlock } from "@/components/kelp/page.tsx";
import { LoadingRegion } from "@/components/kelp/skeletons.tsx";
import { Loaded } from "@/components/kelp/transitions.tsx";
import { FileType, getFileType } from "@/components/reui/file-type";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatBytes, formatDateTime } from "@/lib/format.ts";
import { useAction } from "@/lib/mutations.ts";
import { contentUrl, objectApi, objectKeys, objectQueries, s3Url } from "@/lib/objects-queries.ts";
import { useCanWrite } from "@/lib/session.ts";
import { cn } from "@/lib/utils";
import { Appear } from "./appear.tsx";

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
	const text = useQuery({
		queryKey: [...objectKeys.entry(file.path), "text", file.modifiedAt],
		queryFn: async () => {
			const response = await fetch(contentUrl(file.path), {
				headers: complete ? {} : { range: `bytes=0-${TEXT_PREVIEW_BYTES - 1}` },
			});
			if (!response.ok) throw new Error(`Could not load the file (${response.status})`);
			return response.text();
		},
	});
	return (
		<Loaded
			query={{ data: text.data, error: text.error }}
			skeleton={<SkeletonBlock className="h-48 rounded-lg" />}
		>
			{(data) => (
				<div className="grid gap-2">
					<pre className="max-h-[50svh] overflow-auto rounded-md bg-card p-4 font-mono text-[12px] leading-relaxed [font-variant-ligatures:none]">
						{formatText(data, file.name, complete)}
					</pre>
					{!complete && (
						<p className="text-muted-foreground text-xs">
							Showing the first {formatBytes(TEXT_PREVIEW_BYTES)} of {formatBytes(file.size)}.
						</p>
					)}
				</div>
			)}
		</Loaded>
	);
}

/** The space media takes before and after it loads, so the sheet below never jumps. */
const STAGE: Partial<Record<PreviewKind, string>> = {
	image: "h-[50svh] min-h-56",
	video: "h-[50svh] min-h-56",
	pdf: "h-[60svh]",
	text: "h-48",
};

/**
 * Media loads in its own time: a ghost holds the stage, then the picture sharpens out of a blur.
 * A file that fails to load shows through too, with the browser's own broken state.
 */
function MediaStage({
	className,
	children,
}: {
	className: string | undefined;
	children: (onReady: () => void) => ReactNode;
}) {
	const reduced = usePrefersReducedMotion();
	const [ready, setReady] = useState(false);
	const blurred = reduced ? { opacity: 0 } : { opacity: 0, filter: "blur(10px)" };
	const sharp = reduced
		? { opacity: 1 }
		: { opacity: 1, filter: "blur(0px)", transitionEnd: { filter: "none" } };
	return (
		<div className={cn("grid grid-rows-[minmax(0,1fr)] *:col-start-1 *:row-start-1", className)}>
			<AnimatePresence initial={false}>
				{!ready && (
					<motion.div
						className="kelp-skeleton-in"
						exit={{ opacity: 0, transition: { duration: reduced ? 0 : SPEED.base } }}
					>
						<SkeletonBlock className="size-full rounded-md" />
					</motion.div>
				)}
			</AnimatePresence>
			<motion.div
				className="flex min-h-0 min-w-0 items-center justify-center"
				initial={false}
				animate={ready ? sharp : blurred}
				transition={{ duration: reduced ? 0 : SPEED.slow, ease: EASE }}
			>
				{children(() => setReady(true))}
			</motion.div>
		</div>
	);
}

function Preview({ file }: { file: FileDetails }) {
	const kind = previewKind(file);
	const src = contentUrl(file.path);
	switch (kind) {
		case "image":
			return (
				<MediaStage className={STAGE.image}>
					{(onReady) => (
						<img
							// A cached image has finished before React can listen for `load`.
							ref={(image) => {
								if (image?.complete && image.naturalWidth > 0) onReady();
							}}
							src={src}
							alt={file.name}
							onLoad={onReady}
							onError={onReady}
							className="max-h-full min-w-0 max-w-full rounded-md bg-[repeating-conic-gradient(var(--muted)_0_25%,var(--card)_0_50%)] bg-[length:16px_16px] object-contain shadow-(--float-shadow)"
						/>
					)}
				</MediaStage>
			);
		case "video":
			return (
				<MediaStage className={STAGE.video}>
					{(onReady) => (
						// biome-ignore lint/a11y/useMediaCaption: stored files have no caption track to offer.
						<video
							src={src}
							controls
							onLoadedMetadata={onReady}
							onError={onReady}
							className="max-h-full w-full rounded-md bg-black"
						/>
					)}
				</MediaStage>
			);
		case "audio":
			return (
				// biome-ignore lint/a11y/useMediaCaption: stored files have no caption track to offer.
				<audio src={src} controls className="w-full" />
			);
		case "pdf":
			return (
				<MediaStage className={STAGE.pdf}>
					{(onReady) => (
						<iframe src={src} title={file.name} onLoad={onReady} className="size-full rounded-md bg-white" />
					)}
				</MediaStage>
			);
		case "text":
			return <TextPreview file={file} />;
		default:
			return (
				<div className="flex flex-col items-center gap-3 px-4 py-10 text-center text-[13px] text-muted-foreground">
					<span className="flex size-11 items-center justify-center rounded-full bg-card">
						<FileQuestion className="size-5" />
					</span>
					Kelp cannot preview this type of file. Download it to open it.
				</div>
			);
	}
}

function Property({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="grid grid-cols-[6.5rem_1fr] gap-3 px-3 py-2 text-[13px]">
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
					<Appear inline show={dirty}>
						<Button
							size="sm"
							disabled={!keysValid || save.isPending}
							onClick={() => save.mutate(Object.fromEntries(rows.map((r) => [r.key, r.value])))}
							pending={save.isPending}
						>
							Save tags
						</Button>
					</Appear>
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
		<div className="grid grid-cols-[minmax(0,1fr)] gap-5">
			<div className="rounded-xl bg-raised p-3 dark:bg-card">
				<Preview file={file} />
			</div>
			<div className="flex flex-wrap gap-2">
				<Button render={<a href={contentUrl(file.path, true)} download={file.name} />}>
					<Download />
					Download
				</Button>
			</div>
			<section>
				<h3 className="mb-1.5 px-1 font-semibold text-[13px]">Properties</h3>
				<dl className="group-sheet divide-y divide-border">
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
					<h3 id="versions-heading" className="mb-1.5 px-1 font-semibold text-[13px]">
						Versions
					</h3>
					<ol className="group-sheet divide-y divide-border text-[12px]">
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
					<h3 className="mb-1.5 px-1 font-semibold text-[13px]">
						Chunks <span className="text-muted-foreground">({file.chunkList.length})</span>
					</h3>
					<ul className="max-h-48 group-sheet divide-y divide-border overflow-auto text-[12px]">
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
					<h3 className="mb-1.5 px-1 font-semibold text-[13px]">Attributes</h3>
					<dl className="group-sheet divide-y divide-border">
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
					<h3 id="s3-tags-heading" className="mb-1.5 px-1 font-semibold text-[13px]">
						S3 object tags
					</h3>
					<dl className="group-sheet divide-y divide-border">
						{Object.entries(file.s3Tags).map(([key, value]) => (
							<Property key={key} label={key}>
								{value}
							</Property>
						))}
					</dl>
				</section>
			)}
			<section>
				<h3 className="mb-1.5 px-1 font-semibold text-[13px]">Tags</h3>
				<TagsEditor file={file} />
			</section>
		</div>
	);
}

/** Stands where `Details` lands: the preview's stage, the download button and the properties. */
function DetailsGhost({ name }: { name: string }) {
	const kind = previewKind({ name, mime: "", isDirectory: false });
	return (
		<LoadingRegion label="Loading file" className="grid grid-cols-[minmax(0,1fr)] gap-5">
			<div className="rounded-xl bg-raised p-3 dark:bg-card">
				<SkeletonBlock className={cn("rounded-md", STAGE[kind] ?? "h-36")} />
			</div>
			<SkeletonBlock className="h-8 w-28" />
			<section>
				<h3 className="mb-1.5 px-1 font-semibold text-[13px]">Properties</h3>
				<dl className="group-sheet divide-y divide-border">
					{["Path", "Size", "Type", "Modified", "Created", "Expires", "Permissions"].map((label) => (
						<Property key={label} label={label}>
							<SkeletonBlock className="my-0.5 h-3.5 w-3/5" />
						</Property>
					))}
				</dl>
			</section>
		</LoadingRegion>
	);
}

/** Side sheet with a preview, properties and tags for one file. */
export function FilePreviewSheet({ path, onClose }: { path: string | null; onClose: () => void }) {
	// The sheet slides away showing the file it had, not an empty one.
	const [shown, setShown] = useState(path);
	if (path !== null && path !== shown) setShown(path);
	const file = path ?? shown;
	const entry = useQuery({ ...objectQueries.entry(file ?? ""), enabled: path !== null });
	const { data: s3Endpoint } = useQuery(objectQueries.s3Endpoint());
	const name = file?.slice(file.lastIndexOf("/") + 1) ?? "";
	return (
		<Sheet open={path !== null} onOpenChange={(open) => !open && onClose()}>
			<SheetContent className="w-full gap-0 overflow-x-hidden overflow-y-auto sm:max-w-xl">
				<SheetHeader className="flex-row items-center gap-3 pr-12">
					<FileType type={getFileType(name)} size="sm" aria-hidden="true" />
					<div className="min-w-0">
						<SheetTitle className="truncate">{name}</SheetTitle>
						<SheetDescription className="truncate font-mono text-xs">{file}</SheetDescription>
					</div>
				</SheetHeader>
				<Loaded query={entry} className="px-4 pb-6" skeleton={<DetailsGhost name={name} />}>
					{(data) => <Details file={data} s3Endpoint={s3Endpoint} />}
				</Loaded>
			</SheetContent>
		</Sheet>
	);
}
