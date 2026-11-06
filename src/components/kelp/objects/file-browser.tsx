import type { FileEntry } from "@shared/objects.ts";
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
	ChevronRight,
	Copy,
	Download,
	Eye,
	Folder,
	FolderInput,
	FolderOpen,
	FolderPlus,
	MoreHorizontal,
	RefreshCw,
	Search,
	Trash2,
	Upload,
	X,
} from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
	type DragEvent,
	type FormEvent,
	type ReactNode,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/kelp/confirm-dialog.tsx";
import { matchesSearch } from "@/components/kelp/data-table.tsx";
import { EASE, SPEED, usePrefersReducedMotion } from "@/components/kelp/motion.ts";
import { EmptyState, SkeletonBlock } from "@/components/kelp/page.tsx";
import { LoadingRegion } from "@/components/kelp/skeletons.tsx";
import { TextMorph } from "@/components/kelp/text-morph.tsx";
import { AutoHeight, Loaded, Swap } from "@/components/kelp/transitions.tsx";
import { FileType, getFileType } from "@/components/reui/file-type";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { formatBytes, formatRelative } from "@/lib/format.ts";
import { useAction } from "@/lib/mutations.ts";
import {
	contentUrl,
	joinPath,
	objectApi,
	objectKeys,
	objectQueries,
	parentPath,
	s3Url,
} from "@/lib/objects-queries.ts";
import { useCanWrite } from "@/lib/session.ts";
import { cn } from "@/lib/utils";
import { FilePreviewSheet } from "./file-preview.tsx";
import { FolderSummary, FolderSummaryGhost, summaryShape } from "./folder-summary.tsx";
import { UploadTray, useUploads } from "./uploads.tsx";

/** Folders first, then names in natural order (file2 before file10). */
export function sortEntries(entries: FileEntry[]): FileEntry[] {
	return [...entries].sort((a, b) =>
		a.isDirectory === b.isDirectory
			? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
			: a.isDirectory
				? -1
				: 1,
	);
}

/** Breadcrumb segments from `root` down to `path`. */
export function crumbsFor(
	root: string,
	path: string,
	rootLabel: string,
): Array<{ label: string; path: string }> {
	const crumbs = [{ label: rootLabel, path: root }];
	if (path === root) return crumbs;
	const rest = (root === "/" ? path : path.slice(root.length)).split("/").filter(Boolean);
	let current = root;
	for (const segment of rest) {
		current = joinPath(current, segment);
		crumbs.push({ label: segment, path: current });
	}
	return crumbs;
}

async function copyText(text: string, what: string) {
	await navigator.clipboard.writeText(text);
	toast.success(`${what} copied`);
}

const ROW_HEIGHT = 40;
const ROW_COLUMNS =
	"grid grid-cols-[2.5rem_minmax(0,1fr)_2.75rem] sm:grid-cols-[2.5rem_minmax(0,1fr)_6rem_8rem_2.75rem] items-center border-border border-b px-3";
/** Filer folders that only ever hold other folders. */
const FOLDERS_ONLY = ["/", "/buckets"];

export interface FileBrowserProps {
	/** The folder the browser cannot leave, e.g. `/buckets/media`. */
	root: string;
	rootLabel: string;
	/** The folder being shown, at or below `root`. */
	path: string;
	onNavigate: (path: string) => void;
	/** False holds the listing back until the page knows the folder exists. */
	ready?: boolean;
}

export function FileBrowser({ root, rootLabel, path, onNavigate, ready = true }: FileBrowserProps) {
	const canWrite = useCanWrite();
	const queryClient = useQueryClient();
	// The folder on screen stays until the next one answers, so moving around never blanks the list.
	const listing = useInfiniteQuery({
		...objectQueries.folder(path),
		placeholderData: keepPreviousData,
		enabled: ready,
	});
	const stale = listing.isPlaceholderData;
	const shownFolder = listing.data?.pages[0]?.path ?? path;
	const { data: s3Endpoint } = useQuery(objectQueries.s3Endpoint());
	const [filter, setFilter] = useState("");
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [preview, setPreview] = useState<string | null>(null);
	const [moving, setMoving] = useState<FileEntry | null>(null);
	const [deleting, setDeleting] = useState<FileEntry | null>(null);
	const [creatingFolder, setCreatingFolder] = useState(false);
	const [dragging, setDragging] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [lastRow, setLastRow] = useState(-1);
	const reduced = usePrefersReducedMotion();
	const uploads = useUploads();
	const fileInput = useRef<HTMLInputElement>(null);

	// A new folder starts with a clean slate.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the folder changes.
	useEffect(() => {
		setSelected(new Set());
		setFilter("");
	}, [path]);

	const loaded = useMemo(() => listing.data?.pages.flatMap((page) => page.entries) ?? [], [listing.data]);
	const entries = useMemo(() => {
		const all = sortEntries(loaded);
		return filter.trim() ? all.filter((entry) => matchesSearch(entry.name, filter)) : all;
	}, [loaded, filter]);

	// Load the next page as the list nears its end. This lives here, not in the rows, because a
	// child's effect would run before the query observer has moved to the new folder.
	useEffect(() => {
		if (lastRow >= entries.length - 25 && listing.hasNextPage && !listing.isFetchingNextPage) {
			listing.fetchNextPage();
		}
	}, [lastRow, entries.length, listing.hasNextPage, listing.isFetchingNextPage, listing.fetchNextPage]);

	const refresh = () => {
		setRefreshing(true);
		queryClient.invalidateQueries({ queryKey: objectKeys.folder(path) }).finally(() => setRefreshing(false));
	};

	const remove = useAction({
		run: (paths: string[]) => objectApi.remove(paths),
		success: (result) =>
			result.deleted.length === 1
				? `${result.deleted[0]?.split("/").pop()} deleted`
				: `${result.deleted.length} items deleted`,
		invalidate: [objectKeys.folder(path)],
		onSuccess: (result) => {
			for (const failure of result.failed) toast.error(`${failure.path}: ${failure.error}`);
			setSelected(new Set());
		},
	});

	const toggle = (entryPath: string, on: boolean) =>
		setSelected((current) => {
			const next = new Set(current);
			if (on) next.add(entryPath);
			else next.delete(entryPath);
			return next;
		});
	const allSelected = entries.length > 0 && entries.every((e) => selected.has(e.path));

	const open = (entry: FileEntry) => (entry.isDirectory ? onNavigate(entry.path) : setPreview(entry.path));

	function onDrop(event: DragEvent) {
		event.preventDefault();
		setDragging(false);
		if (canWrite && event.dataTransfer.files.length > 0) uploads.add(path, event.dataTransfer.files);
	}

	return (
		<LayoutGroup>
			{/* Until the listing answers there is nothing to summarize; a failed one reports below. */}
			<AutoHeight>
				<Loaded
					query={{ data: listing.data ? loaded : listing.error ? [] : undefined, error: null }}
					skeleton={<FolderSummaryGhost foldersOnly={FOLDERS_ONLY.includes(path)} />}
				>
					{(summarized) => (
						<Swap id={summaryShape(summarized)}>
							<StaleFade active={stale}>
								<FolderSummary entries={summarized} partial={Boolean(listing.hasNextPage)} onOpen={open} />
							</StaleFade>
						</Swap>
					)}
				</Loaded>
			</AutoHeight>
			<div className="grid grid-cols-[minmax(0,1fr)] gap-3">
				<motion.div layout={reduced ? false : "position"} className="flex flex-wrap items-center gap-2">
					<Breadcrumbs crumbs={crumbsFor(root, path, rootLabel)} onNavigate={onNavigate} />
					<div className="ml-auto flex flex-wrap items-center gap-2">
						<InputGroup className="w-full sm:w-56">
							<InputGroupAddon>
								<Search />
							</InputGroupAddon>
							<InputGroupInput
								aria-label="Filter this folder"
								placeholder="Filter this folder"
								value={filter}
								onChange={(event) => setFilter(event.target.value)}
							/>
							{filter && (
								<InputGroupAddon align="inline-end">
									<InputGroupButton size="icon-xs" aria-label="Clear filter" onClick={() => setFilter("")}>
										<X />
									</InputGroupButton>
								</InputGroupAddon>
							)}
						</InputGroup>
						<Button variant="ghost" size="icon" aria-label="Refresh" onClick={refresh}>
							<RefreshCw className={cn(refreshing && "motion-safe:animate-spin")} />
						</Button>
						{canWrite && (
							<>
								<Button variant="secondary" onClick={() => setCreatingFolder(true)}>
									<FolderPlus />
									New folder
								</Button>
								<Button onClick={() => fileInput.current?.click()}>
									<Upload />
									Upload
								</Button>
								<input
									ref={fileInput}
									type="file"
									multiple
									hidden
									data-testid="upload-input"
									onChange={(event) => {
										if (event.target.files?.length) uploads.add(path, event.target.files);
										event.target.value = "";
									}}
								/>
							</>
						)}
					</div>
				</motion.div>

				<AnimatePresence>
					{canWrite && selected.size > 0 && (
						<motion.div
							layout={reduced ? false : "position"}
							initial={reduced ? false : { opacity: 0, y: -4 }}
							animate={{ opacity: 1, y: 0 }}
							exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -4 }}
							transition={{ duration: SPEED.fast, ease: EASE }}
							className="flex flex-wrap items-center gap-2 rounded-lg bg-primary/10 py-1.5 pr-1.5 pl-3 text-[13px]"
						>
							<span className="font-medium tabular">
								<TextMorph>{`${selected.size} selected`}</TextMorph>
							</span>
							<div className="ml-auto flex gap-2">
								<ConfirmDialog
									trigger={
										<Button variant="destructive" size="sm">
											<Trash2 />
											Delete
										</Button>
									}
									title={`Delete ${selected.size} ${selected.size === 1 ? "item" : "items"}?`}
									description="Folders are deleted with everything inside them. This cannot be undone."
									confirmLabel="Delete"
									destructive
									onConfirm={() => remove.mutateAsync([...selected])}
								/>
								<Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
									Clear
								</Button>
							</div>
						</motion.div>
					)}
				</AnimatePresence>

				<motion.div
					layout={reduced ? false : "position"}
					className="group-sheet relative overflow-hidden"
					onDragOver={(event) => {
						if (!canWrite) return;
						event.preventDefault();
						setDragging(true);
					}}
					onDragLeave={(event) => {
						if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
					}}
					onDrop={onDrop}
				>
					<div className={cn(ROW_COLUMNS, "h-9 font-medium text-[12px] text-muted-foreground")}>
						{canWrite ? (
							<Checkbox
								aria-label="Select all"
								className="mx-auto"
								checked={allSelected}
								disabled={stale}
								indeterminate={selected.size > 0 && !allSelected}
								onCheckedChange={(on) => setSelected(on ? new Set(entries.map((e) => e.path)) : new Set())}
							/>
						) : (
							<span />
						)}
						<span>Name</span>
						<span className="hidden text-right sm:block">Size</span>
						<span className="hidden pl-4 sm:block">Modified</span>
						<span />
					</div>

					<Loaded
						query={listing}
						className="has-[[role=alert]]:p-3"
						skeleton={
							<LoadingRegion label="Loading folder">
								<FolderRowsGhost rows={6} />
							</LoadingRegion>
						}
					>
						{() => (
							<Swap id={`${shownFolder}:${entries.length > 0 ? "list" : filter ? "no-match" : "empty"}`}>
								<StaleFade active={stale}>
									{entries.length > 0 ? (
										<FolderRows
											entries={entries}
											hasMore={Boolean(listing.hasNextPage)}
											onLastRow={setLastRow}
											renderRow={(entry, height, top) => (
												<li
													key={entry.path}
													className={cn(
														ROW_COLUMNS,
														"absolute inset-x-0 text-[13px] transition-colors hover:bg-raised/70",
														selected.has(entry.path) && "bg-primary/8 hover:bg-primary/10",
													)}
													style={{ height, transform: `translateY(${top}px)` }}
												>
													{canWrite ? (
														<Checkbox
															aria-label={`Select ${entry.name}`}
															className="mx-auto"
															checked={selected.has(entry.path)}
															onCheckedChange={(on) => toggle(entry.path, Boolean(on))}
														/>
													) : (
														<span />
													)}
													<button
														type="button"
														className="flex min-w-0 items-center gap-2.5 rounded-md py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
														onClick={() => open(entry)}
													>
														{entry.isDirectory ? (
															<Folder
																aria-hidden="true"
																className="size-5 shrink-0 fill-sky-400/40 text-sky-500"
															/>
														) : (
															<FileType type={getFileType(entry.name)} size="sm" aria-hidden="true" />
														)}
														<span className="truncate">{entry.name}</span>
														{entry.ttlSeconds > 0 && (
															<span className="shrink-0 rounded-sm bg-warning/12 px-1.5 text-[11px] text-warning-foreground">
																expires
															</span>
														)}
													</button>
													<span className="hidden text-right text-[12px] text-muted-foreground tabular sm:block">
														{entry.isDirectory ? "" : formatBytes(entry.size)}
													</span>
													<span className="hidden truncate pl-4 text-[12px] text-muted-foreground sm:block">
														{formatRelative(entry.modifiedAt)}
													</span>
													<EntryMenu
														entry={entry}
														canWrite={canWrite}
														s3={s3Endpoint}
														onOpen={() => open(entry)}
														onMove={() => setMoving(entry)}
														onDelete={() => setDeleting(entry)}
													/>
												</li>
											)}
										/>
									) : (
										<div className="p-3">
											<EmptyState
												icon={<FolderOpen />}
												title={filter ? "Nothing matches that filter" : "This folder is empty"}
												description={
													filter
														? "Try a different name."
														: canWrite
															? "Drop files here, or use Upload."
															: "Files will appear here once someone adds them."
												}
											/>
										</div>
									)}
								</StaleFade>
							</Swap>
						)}
					</Loaded>

					<AnimatePresence>
						{dragging && (
							<motion.div
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-primary/5 ring-2 ring-primary ring-inset"
							>
								<motion.p
									initial={{ y: 6 }}
									animate={{ y: 0 }}
									className="flex items-center gap-2 rounded-lg bg-popover px-4 py-2 font-medium text-[13px] shadow-(--float-shadow)"
								>
									<Upload className="size-4 text-primary" />
									Drop to upload to <span className="font-mono">{path}</span>
								</motion.p>
							</motion.div>
						)}
					</AnimatePresence>
				</motion.div>

				<FilePreviewSheet path={preview} onClose={() => setPreview(null)} />
				<NewFolderDialog open={creatingFolder} parent={path} onOpenChange={setCreatingFolder} />
				<MoveDialog entry={moving} onClose={() => setMoving(null)} />
				<DeleteEntryDialog
					entry={deleting}
					onClose={() => setDeleting(null)}
					onConfirm={(entry) => remove.mutateAsync([entry.path])}
				/>
				<UploadTray uploads={uploads.uploads} onClear={uploads.clear} />
			</div>
		</LayoutGroup>
	);
}

/** Quiets content that is about to be replaced. The delay keeps a quick answer from flickering. */
function StaleFade({ active, children }: { active: boolean; children: ReactNode }) {
	const reduced = usePrefersReducedMotion();
	return (
		<motion.div
			aria-busy={active || undefined}
			className={cn(active && "pointer-events-none")}
			initial={false}
			animate={{ opacity: active ? 0.55 : 1 }}
			transition={{
				duration: reduced ? 0 : SPEED.base,
				delay: active && !reduced ? SPEED.fast : 0,
				ease: EASE,
			}}
		>
			{children}
		</motion.div>
	);
}

function FolderRowsGhost({ rows }: { rows: number }) {
	return Array.from({ length: rows }, (_, i) => (
		// biome-ignore lint/suspicious/noArrayIndexKey: ghosts have no identity.
		<div key={i} className={ROW_COLUMNS} style={{ height: ROW_HEIGHT }}>
			<SkeletonBlock className="mx-auto size-4 rounded-sm" />
			<span className="flex min-w-0 items-center gap-2.5">
				<SkeletonBlock className="size-5 shrink-0 rounded-sm" />
				<SkeletonBlock className="h-3.5 w-2/5" />
			</span>
			<SkeletonBlock className="ml-auto hidden h-3 w-12 sm:block" />
			<SkeletonBlock className="ml-4 hidden h-3 w-16 sm:block" />
			<span />
		</div>
	));
}

/**
 * One folder's rows, virtualized. Its own component so that during a crossfade the outgoing folder
 * keeps its scroll position and rows while the next one mounts at the top.
 */
function FolderRows({
	entries,
	hasMore,
	onLastRow,
	renderRow,
}: {
	entries: FileEntry[];
	hasMore: boolean;
	onLastRow: (index: number) => void;
	renderRow: (entry: FileEntry, height: number, top: number) => ReactNode;
}) {
	const scroller = useRef<HTMLDivElement>(null);
	const virtualizer = useVirtualizer({
		count: entries.length,
		getScrollElement: () => scroller.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: 12,
		initialRect: { width: 960, height: 640 },
	});
	const items = virtualizer.getVirtualItems();
	const lastIndex = items.at(-1)?.index ?? -1;
	useEffect(() => onLastRow(lastIndex), [lastIndex, onLastRow]);

	return (
		<div ref={scroller} className="max-h-[min(65svh,640px)] overflow-auto" data-testid="file-list">
			<ul className="relative" style={{ height: virtualizer.getTotalSize() }}>
				{items.map((item) => renderRow(entries[item.index] as FileEntry, ROW_HEIGHT, item.start))}
			</ul>
			{/* Stands where the next rows land, so the list ends in rows on their way. */}
			{hasMore && (
				<LoadingRegion label="Loading more">
					<FolderRowsGhost rows={2} />
				</LoadingRegion>
			)}
		</div>
	);
}

function Breadcrumbs({
	crumbs,
	onNavigate,
}: {
	crumbs: Array<{ label: string; path: string }>;
	onNavigate: (path: string) => void;
}) {
	const nav = useRef<HTMLElement>(null);
	const last = crumbs.at(-1)?.path;
	const reduced = usePrefersReducedMotion();
	// Long paths scroll; keep the folder being shown in view.
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll again only when the folder changes.
	useEffect(() => {
		nav.current?.scrollTo?.({ left: nav.current.scrollWidth });
	}, [last]);
	return (
		<nav
			ref={nav}
			aria-label="Folder path"
			className="flex h-8 min-w-0 max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-secondary p-0.5 text-[13px]"
		>
			<AnimatePresence initial={false} mode="popLayout">
				{crumbs.map((crumb, index) => {
					const last = index === crumbs.length - 1;
					return (
						<motion.span
							key={crumb.path}
							layout={reduced ? false : "position"}
							initial={reduced ? false : { opacity: 0, x: -6 }}
							animate={{ opacity: 1, x: 0 }}
							exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, x: -6 }}
							transition={{ duration: SPEED.fast, ease: EASE }}
							className="flex min-w-0 shrink-0 items-center gap-0.5"
						>
							{index > 0 && <ChevronRight className="size-3.5 shrink-0 text-tertiary" />}
							{last ? (
								<span
									aria-current="page"
									className="flex h-7 max-w-64 items-center gap-1.5 truncate rounded-md bg-[var(--thumb)] px-2.5 font-medium shadow-[0_1px_3px_rgb(0_0_0/0.12)]"
								>
									{index === 0 && <FolderOpen className="size-3.5 shrink-0 text-sky-500" />}
									<span className="truncate">{crumb.label}</span>
								</span>
							) : (
								<button
									type="button"
									className="flex h-7 max-w-48 items-center gap-1.5 truncate rounded-md px-2.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
									onClick={() => onNavigate(crumb.path)}
								>
									{index === 0 && <Folder className="size-3.5 shrink-0 text-sky-500" />}
									<span className="truncate">{crumb.label}</span>
								</button>
							)}
						</motion.span>
					);
				})}
			</AnimatePresence>
		</nav>
	);
}

function EntryMenu({
	entry,
	canWrite,
	s3,
	onOpen,
	onMove,
	onDelete,
}: {
	entry: FileEntry;
	canWrite: boolean;
	s3: string | null | undefined;
	onOpen: () => void;
	onMove: () => void;
	onDelete: () => void;
}) {
	const url = s3Url(s3, entry.path);
	return (
		<div className="flex justify-center">
			<DropdownMenu>
				<DropdownMenuTrigger
					render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${entry.name}`} />}
				>
					<MoreHorizontal />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-48">
					<DropdownMenuItem onClick={onOpen}>
						{entry.isDirectory ? <FolderOpen /> : <Eye />}
						{entry.isDirectory ? "Open" : "Preview"}
					</DropdownMenuItem>
					{!entry.isDirectory && (
						<DropdownMenuItem render={<a href={contentUrl(entry.path, true)} download={entry.name} />}>
							<Download />
							Download
						</DropdownMenuItem>
					)}
					<DropdownMenuItem onClick={() => copyText(entry.path, "Path")}>
						<Copy />
						Copy path
					</DropdownMenuItem>
					{url && (
						<DropdownMenuItem onClick={() => copyText(url, "S3 URL")}>
							<Copy />
							Copy S3 URL
						</DropdownMenuItem>
					)}
					{canWrite && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={onMove}>
								<FolderInput />
								Move or rename
							</DropdownMenuItem>
							<DropdownMenuItem variant="destructive" onClick={onDelete}>
								<Trash2 />
								Delete
							</DropdownMenuItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

function NewFolderDialog({
	open,
	parent,
	onOpenChange,
}: {
	open: boolean;
	parent: string;
	onOpenChange: (open: boolean) => void;
}) {
	const id = useId();
	const [name, setName] = useState("");
	const create = useAction({
		run: (folder: string) => objectApi.createFolder(parent, folder),
		success: (_out, folder) => `Folder ${folder} created`,
		invalidate: [objectKeys.folder(parent)],
		onSuccess: () => {
			setName("");
			onOpenChange(false);
		},
	});
	const invalid = !name.trim() || name.includes("/");
	function submit(event: FormEvent) {
		event.preventDefault();
		if (!invalid) create.mutate(name.trim());
	}
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<form onSubmit={submit} className="grid gap-4">
					<DialogHeader>
						<DialogTitle>New folder</DialogTitle>
						<DialogDescription>
							Created inside <span className="font-mono">{parent}</span>.
						</DialogDescription>
					</DialogHeader>
					<Field>
						<FieldLabel htmlFor={`${id}-name`}>Folder name</FieldLabel>
						<Input
							id={`${id}-name`}
							value={name}
							autoComplete="off"
							onChange={(e) => setName(e.target.value)}
						/>
						{name.includes("/") && (
							<FieldDescription className="text-destructive">Names cannot contain /.</FieldDescription>
						)}
					</Field>
					<DialogFooter>
						<Button type="submit" disabled={invalid || create.isPending} pending={create.isPending}>
							Create folder
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function MoveDialog({ entry, onClose }: { entry: FileEntry | null; onClose: () => void }) {
	const id = useId();
	const [target, setTarget] = useState("");
	useEffect(() => setTarget(entry?.path ?? ""), [entry]);
	const move = useAction({
		run: ({ from, to }: { from: string; to: string }) => objectApi.move(from, to),
		success: (_out, input) =>
			parentPath(input.from) === parentPath(input.to)
				? `Renamed to ${input.to.split("/").pop()}`
				: `Moved to ${parentPath(input.to)}`,
		invalidate: [objectKeys.files],
		onSuccess: onClose,
	});
	const invalid = !target.startsWith("/") || target === entry?.path || target.endsWith("/");
	function submit(event: FormEvent) {
		event.preventDefault();
		if (entry && !invalid) move.mutate({ from: entry.path, to: target });
	}
	return (
		<Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-lg">
				<form onSubmit={submit} className="grid gap-4">
					<DialogHeader>
						<DialogTitle>Move or rename</DialogTitle>
						<DialogDescription>Edit the name to rename, or the folders to move.</DialogDescription>
					</DialogHeader>
					<Field>
						<FieldLabel htmlFor={`${id}-target`}>New path</FieldLabel>
						<Input
							id={`${id}-target`}
							value={target}
							className="font-mono"
							spellCheck={false}
							autoComplete="off"
							onChange={(e) => setTarget(e.target.value)}
						/>
						<FieldDescription>Missing folders on the way are created.</FieldDescription>
					</Field>
					<DialogFooter>
						<Button type="submit" disabled={invalid || move.isPending} pending={move.isPending}>
							Move
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function DeleteEntryDialog({
	entry,
	onClose,
	onConfirm,
}: {
	entry: FileEntry | null;
	onClose: () => void;
	onConfirm: (entry: FileEntry) => Promise<unknown>;
}) {
	const [busy, setBusy] = useState(false);
	async function confirm() {
		if (!entry) return;
		setBusy(true);
		try {
			await onConfirm(entry);
			onClose();
		} catch {
			// The action toasts its own error.
		} finally {
			setBusy(false);
		}
	}
	return (
		<AlertDialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete {entry?.name}?</AlertDialogTitle>
					<AlertDialogDescription>
						{entry?.isDirectory
							? "The folder and everything inside it are deleted. This cannot be undone."
							: "This cannot be undone."}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
					<Button variant="destructive" disabled={busy} onClick={confirm} pending={busy}>
						{entry?.isDirectory ? "Delete folder" : "Delete file"}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
