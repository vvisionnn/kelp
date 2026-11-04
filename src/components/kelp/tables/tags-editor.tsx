import { Plus, Tag, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

interface Row {
	id: number;
	key: string;
	value: string;
}

let nextId = 0;
const toRows = (tags: Record<string, string>): Row[] =>
	Object.entries(tags).map(([key, value]) => ({ id: nextId++, key, value }));

/** Rows -> tags, or the first problem with them. */
export function tagsFromRows(rows: Array<{ key: string; value: string }>): {
	tags: Record<string, string>;
	error: string | null;
} {
	const tags: Record<string, string> = {};
	for (const row of rows) {
		const key = row.key.trim();
		if (!key && !row.value.trim()) continue;
		if (!key) return { tags, error: "Every tag needs a key." };
		if (key in tags) return { tags, error: `The key ${key} is used twice.` };
		tags[key] = row.value.trim();
	}
	if (Object.keys(tags).length > 50) return { tags, error: "Use at most 50 tags." };
	return { tags, error: null };
}

export function sameTags(a: Record<string, string>, b: Record<string, string>): boolean {
	const keys = Object.keys(a);
	return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}

/** Read-only chips for viewers, an inline key/value editor for administrators. */
export function TagsEditor({
	tags,
	canEdit,
	onSave,
}: {
	tags: Record<string, string>;
	canEdit: boolean;
	onSave: (tags: Record<string, string>) => Promise<unknown>;
}) {
	const [rows, setRows] = useState<Row[]>(() => toRows(tags));
	const [saving, setSaving] = useState(false);
	const savedKey = JSON.stringify(tags);
	// biome-ignore lint/correctness/useExhaustiveDependencies: follow the saved tags when they change.
	useEffect(() => setRows(toRows(tags)), [savedKey]);
	const { tags: next, error } = tagsFromRows(rows);
	const dirty = !sameTags(next, tags);

	if (!canEdit) {
		const entries = Object.entries(tags);
		return entries.length ? (
			<div className="flex flex-wrap gap-1.5">
				{entries.map(([key, value]) => (
					<Badge key={key} variant="secondary" className="font-mono">
						{key}={value}
					</Badge>
				))}
			</div>
		) : (
			<p className="text-muted-foreground text-sm">No tags.</p>
		);
	}

	const update = (id: number, patch: Partial<Row>) =>
		setRows((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)));

	return (
		<form
			className="grid gap-2"
			onSubmit={async (event) => {
				event.preventDefault();
				setSaving(true);
				try {
					await onSave(next);
				} catch {
					// The action shows its own error.
				} finally {
					setSaving(false);
				}
			}}
		>
			<AnimatePresence initial={false}>
				{rows.map((row) => (
					<motion.div
						key={row.id}
						layout
						initial={{ opacity: 0, height: 0 }}
						animate={{ opacity: 1, height: "auto" }}
						exit={{ opacity: 0, height: 0 }}
						className="flex items-center gap-2"
					>
						<Input
							aria-label="Tag key"
							placeholder="key"
							className="font-mono"
							value={row.key}
							onChange={(e) => update(row.id, { key: e.target.value })}
						/>
						<Input
							aria-label="Tag value"
							placeholder="value"
							className="font-mono"
							value={row.value}
							onChange={(e) => update(row.id, { value: e.target.value })}
						/>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label={`Remove tag ${row.key || "row"}`}
							onClick={() => setRows((all) => all.filter((r) => r.id !== row.id))}
						>
							<X />
						</Button>
					</motion.div>
				))}
			</AnimatePresence>
			{rows.length === 0 && (
				<p className="flex items-center gap-2 text-muted-foreground text-sm">
					<Tag className="size-3.5" />
					No tags yet.
				</p>
			)}
			{error && <p className="text-destructive text-xs">{error}</p>}
			<div className="flex items-center justify-between gap-2 pt-1">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => setRows((all) => [...all, { id: nextId++, key: "", value: "" }])}
				>
					<Plus />
					Add tag
				</Button>
				<Button type="submit" size="sm" disabled={!dirty || Boolean(error) || saving}>
					{saving && <Spinner />}
					Save tags
				</Button>
			</div>
		</form>
	);
}
