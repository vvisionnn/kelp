import type { FileEntry } from "@shared/objects.ts";
import type { ReactNode } from "react";
import { BarList, dataColor } from "@/components/kelp/charts/index.ts";
import { SkeletonBlock } from "@/components/kelp/page.tsx";
import { LoadingRegion } from "@/components/kelp/skeletons.tsx";
import { RollingValue, TextMorph } from "@/components/kelp/text-morph.tsx";
import { formatBytes, formatCount, formatRelative, plural } from "@/lib/format.ts";
import { cn } from "@/lib/utils";
import { folderStats } from "./insights.ts";

/**
 * Every folder gets the same three sheets at the same height, so the ghost always stands exactly
 * where the summary lands and moving between folders only rolls numbers over. On phones the list
 * itself is the summary, so only the counts show.
 */
const ROW = "mb-3 grid grid-cols-1 gap-3 lg:grid-cols-12";
const SHEET = "group-sheet p-4 lg:col-span-4 lg:h-56";
const SIDE = `${SHEET} max-lg:hidden`;

/**
 * What is in the folder being browsed: counts and bytes, what kinds of files take the space, and
 * the largest files (click one to preview it). Computed from the loaded listing.
 */
export function FolderSummary({
	entries,
	partial,
	onOpen,
}: {
	entries: FileEntry[];
	/** True when only the first pages of a large folder are loaded. */
	partial: boolean;
	onOpen: (entry: FileEntry) => void;
}) {
	const stats = folderStats(entries);
	const none = entries.length === 0 ? "No files yet." : "Only folders here.";
	return (
		<section aria-label="Folder summary" className={ROW}>
			<div className={cn(SHEET, "flex flex-col")}>
				<dl className="grid grid-cols-2 gap-x-4 gap-y-3">
					<Stat label="Folders">
						<RollingValue text={formatCount(stats.folders)} />
					</Stat>
					<Stat label="Files">
						<RollingValue text={formatCount(stats.files)} />
					</Stat>
					<Stat label="Size of files here">
						<RollingValue text={formatBytes(stats.bytes)} />
					</Stat>
					<Stat label="Last change">
						<TextMorph>{stats.newest ? formatRelative(stats.newest.modifiedAt) : "–"}</TextMorph>
					</Stat>
				</dl>
				<p className="mt-3 text-[12px] text-muted-foreground lg:mt-auto">
					<TextMorph>
						{partial
							? `Counts the first ${plural(entries.length, "item")}; scroll the list to load more.`
							: "Counts every item in this folder."}
					</TextMorph>
				</p>
			</div>
			<div className={SIDE}>
				<h3 className="mb-3 font-semibold text-[13px]">By type</h3>
				{stats.files > 0 ? (
					<BarList
						label="Bytes by file type"
						color={dataColor(0)}
						items={stats.kinds.slice(0, 5).map((k) => ({
							key: k.kind,
							label: k.kind,
							value: k.bytes,
							display: formatBytes(k.bytes),
						}))}
					/>
				) : (
					<p className="text-[13px] text-muted-foreground">{none}</p>
				)}
			</div>
			<div className={SIDE}>
				<h3 className="mb-2 font-semibold text-[13px]">Largest files</h3>
				{stats.files > 0 ? (
					<ul aria-label="Largest files" className="divide-y divide-border">
						{stats.largest.map((file) => (
							<li key={file.path}>
								<button
									type="button"
									onClick={() => onOpen(file)}
									className="flex w-full items-center justify-between gap-3 py-1.5 text-left text-[13px] hover:underline"
								>
									<span className="truncate">{file.name}</span>
									<span className="shrink-0 text-[12px] text-muted-foreground tabular">
										{formatBytes(file.size)}
									</span>
								</button>
							</li>
						))}
					</ul>
				) : (
					<p className="text-[13px] text-muted-foreground">{none}</p>
				)}
			</div>
		</section>
	);
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="min-w-0">
			<dt className="text-[12px] text-muted-foreground">{label}</dt>
			<dd className="truncate font-rounded font-semibold text-[20px] leading-6 tracking-[-0.015em]">
				{children}
			</dd>
		</div>
	);
}

/** Stands exactly where the summary lands: the same sheets, titles and heights. */
export function FolderSummaryGhost() {
	return (
		<LoadingRegion label="Loading folder summary" className={ROW}>
			<div className={cn(SHEET, "flex flex-col")}>
				<div className="grid grid-cols-2 gap-x-4 gap-y-3">
					{["Folders", "Files", "Size of files here", "Last change"].map((label) => (
						<div key={label} className="min-w-0">
							<p className="text-[12px] text-muted-foreground leading-[18px]">{label}</p>
							<SkeletonBlock className="h-6 w-16" />
						</div>
					))}
				</div>
				<SkeletonBlock className="mt-3 h-3.5 w-48 lg:mt-auto" />
			</div>
			<div className={SIDE}>
				<h3 className="mb-3 font-semibold text-[13px]">By type</h3>
				<SkeletonBlock className="h-3.5 w-1/3" />
				<SkeletonBlock className="mt-2 h-1.5 w-full" />
			</div>
			<div className={SIDE}>
				<h3 className="mb-2 font-semibold text-[13px]">Largest files</h3>
				<div className="space-y-4 pt-1.5">
					{[0, 1, 2, 3, 4].map((i) => (
						<SkeletonBlock key={i} className="h-3.5 w-full" />
					))}
				</div>
			</div>
		</LoadingRegion>
	);
}
