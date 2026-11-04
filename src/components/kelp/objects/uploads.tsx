import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/format.ts";
import { joinPath, objectKeys, uploadFile } from "@/lib/objects-queries.ts";

export interface Upload {
	id: string;
	name: string;
	dir: string;
	size: number;
	progress: number;
	status: "queued" | "uploading" | "done" | "failed";
	error?: string;
}

/** Files uploaded at the same time. More rarely helps a single filer. */
const CONCURRENCY = 3;

/** Queues uploads, runs a few at a time, and refreshes the folder as each one lands. */
export function useUploads() {
	const queryClient = useQueryClient();
	const [uploads, setUploads] = useState<Upload[]>([]);
	const files = useRef(new Map<string, { file: File; dir: string }>());
	const active = useRef(0);
	const queue = useRef<string[]>([]);

	const update = useCallback((id: string, patch: Partial<Upload>) => {
		setUploads((list) => list.map((u) => (u.id === id ? { ...u, ...patch } : u)));
	}, []);

	const pump = useCallback(() => {
		while (active.current < CONCURRENCY && queue.current.length > 0) {
			const id = queue.current.shift() as string;
			const { file, dir } = files.current.get(id) as { file: File; dir: string };
			active.current += 1;
			update(id, { status: "uploading" });
			uploadFile(dir, file, { onProgress: (progress) => update(id, { progress }) })
				.then(() => {
					update(id, { status: "done", progress: 1 });
					queryClient.invalidateQueries({ queryKey: objectKeys.folder(dir) });
				})
				.catch((error: Error) => {
					update(id, { status: "failed", error: error.message });
					toast.error(`${file.name} was not uploaded: ${error.message}`);
				})
				.finally(() => {
					files.current.delete(id);
					active.current -= 1;
					pump();
				});
		}
	}, [queryClient, update]);

	const add = useCallback(
		(dir: string, list: FileList | File[]) => {
			const added: Upload[] = Array.from(list).map((file) => {
				const id = `${joinPath(dir, file.name)}-${crypto.randomUUID()}`;
				files.current.set(id, { file, dir });
				queue.current.push(id);
				return { id, name: file.name, dir, size: file.size, progress: 0, status: "queued" };
			});
			setUploads((current) => [...current.filter((u) => u.status !== "done"), ...added]);
			pump();
		},
		[pump],
	);

	const clear = useCallback(
		() => setUploads((list) => list.filter((u) => u.status === "uploading" || u.status === "queued")),
		[],
	);

	return { uploads, add, clear };
}

/** A floating tray that shows each upload settling into place. */
export function UploadTray({ uploads, onClear }: { uploads: Upload[]; onClear: () => void }) {
	const finished = uploads.filter((u) => u.status === "done").length;
	const busy = uploads.some((u) => u.status === "uploading" || u.status === "queued");
	return (
		<AnimatePresence>
			{uploads.length > 0 && (
				<motion.section
					aria-label="Uploads"
					initial={{ opacity: 0, y: 16, scale: 0.98 }}
					animate={{ opacity: 1, y: 0, scale: 1 }}
					exit={{ opacity: 0, y: 16, scale: 0.98 }}
					transition={{ type: "spring", stiffness: 380, damping: 32 }}
					className="fixed right-4 bottom-4 z-40 w-80 overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-(--float-shadow)"
				>
					<header className="flex h-11 items-center justify-between gap-2 border-border border-b px-4">
						<p className="font-semibold text-[13px]">
							{busy
								? `Uploading ${finished} of ${uploads.length}`
								: `${finished} of ${uploads.length} uploaded`}
						</p>
						{!busy && (
							<Button variant="ghost" size="icon-xs" aria-label="Close uploads" onClick={onClear}>
								<X />
							</Button>
						)}
					</header>
					<ul className="max-h-64 divide-y divide-border overflow-auto">
						{uploads.map((upload) => (
							<motion.li key={upload.id} layout className="grid gap-1.5 px-4 py-2.5 text-[13px]">
								<div className="flex items-center justify-between gap-2">
									<span className="truncate">{upload.name}</span>
									{upload.status === "done" ? (
										<CircleCheck className="size-4 shrink-0 text-success" aria-label="Uploaded" />
									) : upload.status === "failed" ? (
										<CircleAlert className="size-4 shrink-0 text-destructive" aria-label="Failed" />
									) : (
										<span className="shrink-0 text-muted-foreground text-xs tabular">
											{Math.round(upload.progress * 100)}%
										</span>
									)}
								</div>
								{upload.status === "failed" ? (
									<p className="text-destructive text-xs">{upload.error}</p>
								) : (
									<div
										className="h-1 overflow-hidden rounded-full bg-accent"
										role="progressbar"
										aria-label={`${upload.name} progress`}
										aria-valuenow={Math.round(upload.progress * 100)}
										aria-valuemin={0}
										aria-valuemax={100}
									>
										<motion.div
											className={
												upload.status === "done"
													? "h-full rounded-full bg-success"
													: "h-full rounded-full bg-primary"
											}
											animate={{ width: `${upload.progress * 100}%` }}
											transition={{ ease: "easeOut", duration: 0.2 }}
										/>
									</div>
								)}
								<p className="text-muted-foreground text-xs">
									{formatBytes(upload.size)} to <span className="font-mono">{upload.dir}</span>
								</p>
							</motion.li>
						))}
					</ul>
				</motion.section>
			)}
		</AnimatePresence>
	);
}
