import type { FileEntry } from "@shared/objects.ts";
import type { ReactNode } from "react";
import { BarList, dataColor } from "@/components/kelp/charts/index.ts";
import { SkeletonBlock } from "@/components/kelp/page.tsx";
import { LoadingRegion } from "@/components/kelp/skeletons.tsx";
import { RollingValue, TextMorph } from "@/components/kelp/text-morph.tsx";
import { formatBytes, formatCount, formatRelative } from "@/lib/format.ts";
import { cn } from "@/lib/utils";
import { Appear } from "./appear.tsx";
import { folderStats } from "./insights.ts";

/** Small folders show every file in the list already; ranking only helps past this many. */
const LARGEST_AFTER = 10;

/** Which panels a listing fills. Between folders of one shape, the numbers simply roll over. */
export function summaryShape(entries: FileEntry[]): string {
	if (entries.length === 0) return "none";
	const { files } = folderStats(entries);
	return files === 0 ? "counts" : files > LARGEST_AFTER ? "largest" : "types";
}

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
	if (entries.length === 0) return null;
	return (
		<section aria-label="Folder summary" className="mb-3 grid grid-cols-1 gap-3 xl:grid-cols-12">
			<dl className="group-sheet grid grid-cols-2 gap-x-4 gap-y-3 p-4 xl:col-span-4">
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
				<Appear show={partial} className="col-span-full">
					<p className="text-[12px] text-muted-foreground">
						Counts the first {formatCount(entries.length)} items; scroll the list to load more.
					</p>
				</Appear>
			</dl>
			{stats.files > 0 && (
				<>
					<div
						className={cn("group-sheet p-4", stats.files > LARGEST_AFTER ? "xl:col-span-4" : "xl:col-span-8")}
					>
						<h3 className="mb-3 font-semibold text-[13px]">By type</h3>
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
					</div>
					{stats.files > LARGEST_AFTER && (
						<div className="group-sheet p-4 xl:col-span-4">
							<h3 className="mb-2 font-semibold text-[13px]">Largest files</h3>
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
						</div>
					)}
				</>
			)}
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

/** Matches the summary's sheets. A folder holding only folders has just the counts. */
export function FolderSummaryGhost({ foldersOnly }: { foldersOnly: boolean }) {
	return (
		<LoadingRegion label="Loading folder summary" className="mb-3 grid grid-cols-1 gap-3 xl:grid-cols-12">
			<div className="group-sheet grid min-h-[129px] grid-cols-2 gap-x-4 gap-y-3 p-4 xl:col-span-4">
				{["Folders", "Files", "Size of files here", "Last change"].map((label) => (
					<div key={label} className="min-w-0">
						<p className="text-[12px] text-muted-foreground leading-[18px]">{label}</p>
						<SkeletonBlock className="h-6 w-16" />
					</div>
				))}
			</div>
			{!foldersOnly && (
				<div className="group-sheet p-4 xl:col-span-8">
					<h3 className="mb-3 font-semibold text-[13px]">By type</h3>
					<SkeletonBlock className="h-3.5 w-1/3" />
					<SkeletonBlock className="mt-2 h-1.5 w-full" />
				</div>
			)}
		</LoadingRegion>
	);
}
