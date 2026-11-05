import type { FileEntry } from "@shared/objects.ts";
import { BarList, dataColor } from "@/components/kelp/charts/index.ts";
import { formatBytes, formatCount, formatRelative } from "@/lib/format.ts";
import { cn } from "@/lib/utils";
import { folderStats } from "./insights.ts";

/** Small folders show every file in the list already; ranking only helps past this many. */
const LARGEST_AFTER = 10;

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
		<section aria-label="Folder summary" className="grid grid-cols-1 gap-3 xl:grid-cols-12">
			<dl className="group-sheet grid grid-cols-2 gap-x-4 gap-y-3 p-4 xl:col-span-4">
				<Stat label="Folders" value={formatCount(stats.folders)} />
				<Stat label="Files" value={formatCount(stats.files)} />
				<Stat label="Size of files here" value={formatBytes(stats.bytes)} />
				<Stat label="Last change" value={stats.newest ? formatRelative(stats.newest.modifiedAt) : "–"} />
				{partial && (
					<p className="col-span-full text-[12px] text-muted-foreground">
						Counts the first {formatCount(entries.length)} items; scroll the list to load more.
					</p>
				)}
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

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0">
			<dt className="text-[12px] text-muted-foreground">{label}</dt>
			<dd className="truncate font-rounded font-semibold text-[20px] leading-6 tracking-[-0.015em]">
				{value}
			</dd>
		</div>
	);
}
