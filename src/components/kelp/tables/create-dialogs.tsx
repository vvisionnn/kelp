import { ICEBERG_PRIMITIVE_TYPES } from "@shared/tables.ts";
import { useNavigate } from "@tanstack/react-router";
import { FolderPlus, Plus, TablePropertiesIcon, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api.ts";
import { useAction } from "@/lib/mutations.ts";

export const BUCKET_NAME = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
export const IDENTIFIER = /^[a-z0-9_]{1,255}$/;
export const NAMESPACE = /^[a-z0-9_]{1,255}(\.[a-z0-9_]{1,255})*$/;

function FormDialog({
	trigger,
	title,
	description,
	submitLabel,
	ready,
	pending,
	onSubmit,
	onClose,
	open,
	setOpen,
	children,
	wide,
}: {
	trigger: ReactNode;
	title: string;
	description: string;
	submitLabel: string;
	ready: boolean;
	pending: boolean;
	onSubmit: () => void;
	onClose: () => void;
	open: boolean;
	setOpen: (open: boolean) => void;
	children: ReactNode;
	wide?: boolean;
}) {
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) onClose();
			}}
		>
			<DialogTrigger render={trigger as React.ReactElement} />
			<DialogContent className={wide ? "sm:max-w-xl" : "sm:max-w-md"}>
				<form
					className="grid gap-5"
					onSubmit={(event) => {
						event.preventDefault();
						if (ready) onSubmit();
					}}
				>
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
						<DialogDescription>{description}</DialogDescription>
					</DialogHeader>
					{children}
					<DialogFooter>
						<Button type="submit" disabled={!ready || pending}>
							{pending && <Spinner />}
							{submitLabel}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

const hint = (text: string, bad: boolean) => (
	<p className={bad ? "text-destructive text-xs" : "text-muted-foreground text-xs"}>{text}</p>
);

export function CreateBucketDialog() {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [owner, setOwner] = useState("");
	const navigate = useNavigate();
	const create = useAction({
		run: () =>
			api.post("/tables/buckets", { name: name.trim(), ...(owner.trim() ? { owner: owner.trim() } : {}) }),
		success: () => `Table bucket ${name.trim()} created`,
		invalidate: [["tables"]],
		onSuccess: () => {
			setOpen(false);
			navigate({ to: "/tables/$bucket", params: { bucket: name.trim() } });
		},
	});
	const valid = BUCKET_NAME.test(name.trim());
	return (
		<FormDialog
			open={open}
			setOpen={setOpen}
			onClose={() => {
				setName("");
				setOwner("");
				create.reset();
			}}
			trigger={
				<Button>
					<Plus />
					Create table bucket
				</Button>
			}
			title="Create table bucket"
			description="A table bucket is an Iceberg warehouse. Engines reach it at s3://name."
			submitLabel="Create table bucket"
			ready={valid}
			pending={create.isPending}
			onSubmit={() => create.mutate()}
		>
			<div className="grid gap-1.5">
				<Label htmlFor="bucket-name">Name</Label>
				<Input
					id="bucket-name"
					className="font-mono"
					placeholder="analytics"
					value={name}
					onChange={(e) => setName(e.target.value)}
					autoComplete="off"
				/>
				{hint("3 to 63 lowercase letters, digits and hyphens.", Boolean(name) && !valid)}
			</div>
			<div className="grid gap-1.5">
				<Label htmlFor="bucket-owner">Owner account</Label>
				<Input
					id="bucket-owner"
					placeholder="Optional"
					value={owner}
					onChange={(e) => setOwner(e.target.value)}
					autoComplete="off"
				/>
				{hint("The identity that owns the bucket. Leave empty for the admin account.", false)}
			</div>
		</FormDialog>
	);
}

export function CreateNamespaceDialog({ bucket }: { bucket: string }) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const create = useAction({
		run: () => api.post(`/tables/buckets/${encodeURIComponent(bucket)}/namespaces`, { name: name.trim() }),
		success: () => `Namespace ${name.trim()} created`,
		invalidate: [["tables", "bucket", bucket]],
		onSuccess: () => setOpen(false),
	});
	const valid = NAMESPACE.test(name.trim());
	return (
		<FormDialog
			open={open}
			setOpen={setOpen}
			onClose={() => {
				setName("");
				create.reset();
			}}
			trigger={
				<Button variant="outline">
					<FolderPlus />
					Create namespace
				</Button>
			}
			title="Create namespace"
			description="Namespaces group tables, like a database schema."
			submitLabel="Create namespace"
			ready={valid}
			pending={create.isPending}
			onSubmit={() => create.mutate()}
		>
			<div className="grid gap-1.5">
				<Label htmlFor="namespace-name">Name</Label>
				<Input
					id="namespace-name"
					className="font-mono"
					placeholder="sales"
					value={name}
					onChange={(e) => setName(e.target.value)}
					autoComplete="off"
				/>
				{hint(
					"Lowercase letters, digits and underscores. Use dots to nest, like emea.retail.",
					Boolean(name) && !valid,
				)}
			</div>
		</FormDialog>
	);
}

interface ColumnDraft {
	id: number;
	name: string;
	type: string;
	required: boolean;
}

let columnId = 0;
const blankColumn = (): ColumnDraft => ({ id: columnId++, name: "", type: "string", required: false });

/** The first problem with a set of column drafts, or null. */
export function columnsProblem(columns: Array<{ name: string }>): string | null {
	if (!columns.length) return "Add at least one column.";
	if (columns.some((c) => !c.name.trim())) return "Name every column.";
	const names = columns.map((c) => c.name.trim());
	if (new Set(names).size !== names.length) return "Column names must be unique.";
	return null;
}

export function CreateTableDialog({ bucket, namespaces }: { bucket: string; namespaces: string[] }) {
	const [open, setOpen] = useState(false);
	const [namespace, setNamespace] = useState(namespaces[0] ?? "");
	const [name, setName] = useState("");
	const [columns, setColumns] = useState<ColumnDraft[]>(() => [
		{ ...blankColumn(), name: "id", type: "long", required: true },
	]);
	const navigate = useNavigate();
	const create = useAction({
		run: () =>
			api.post(
				`/tables/buckets/${encodeURIComponent(bucket)}/namespaces/${encodeURIComponent(namespace)}/tables`,
				{
					name: name.trim(),
					fields: columns.map((c) => ({ name: c.name.trim(), type: c.type, required: c.required })),
				},
			),
		success: () => `Table ${namespace}.${name.trim()} created`,
		invalidate: [["tables", "bucket", bucket]],
		onSuccess: () => {
			setOpen(false);
			navigate({
				to: "/tables/$bucket/$namespace/$table",
				params: { bucket, namespace, table: name.trim() },
			});
		},
	});
	const problem = columnsProblem(columns);
	const validName = IDENTIFIER.test(name.trim());
	const update = (id: number, patch: Partial<ColumnDraft>) =>
		setColumns((all) => all.map((c) => (c.id === id ? { ...c, ...patch } : c)));

	return (
		<FormDialog
			wide
			open={open}
			setOpen={setOpen}
			onClose={() => {
				setName("");
				setColumns([{ ...blankColumn(), name: "id", type: "long", required: true }]);
				create.reset();
			}}
			trigger={
				<Button disabled={!namespaces.length}>
					<TablePropertiesIcon />
					Create table
				</Button>
			}
			title="Create table"
			description="Registers an Iceberg table and its columns. Engines write data into it."
			submitLabel="Create table"
			ready={validName && !problem && Boolean(namespace)}
			pending={create.isPending}
			onSubmit={() => create.mutate()}
		>
			<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3">
				<div className="grid gap-1.5">
					<Label htmlFor="table-namespace">Namespace</Label>
					<select
						id="table-namespace"
						className="h-8 rounded-lg border border-input bg-transparent px-2 font-mono text-sm dark:bg-input/30"
						value={namespace}
						onChange={(e) => setNamespace(e.target.value)}
					>
						{namespaces.map((ns) => (
							<option key={ns} value={ns}>
								{ns}
							</option>
						))}
					</select>
				</div>
				<div className="grid gap-1.5">
					<Label htmlFor="table-name">Name</Label>
					<Input
						id="table-name"
						className="font-mono"
						placeholder="orders"
						value={name}
						onChange={(e) => setName(e.target.value)}
						autoComplete="off"
					/>
				</div>
			</div>
			{name && !validName && hint("Lowercase letters, digits and underscores.", true)}
			<fieldset className="grid gap-2">
				<legend className="mb-2 font-medium text-sm">Columns</legend>
				<AnimatePresence initial={false}>
					{columns.map((column, index) => (
						<motion.div
							key={column.id}
							layout
							initial={{ opacity: 0, height: 0 }}
							animate={{ opacity: 1, height: "auto" }}
							exit={{ opacity: 0, height: 0 }}
							className="grid grid-cols-[minmax(0,1fr)_9rem_auto_auto] items-center gap-2"
						>
							<Input
								aria-label={`Column ${index + 1} name`}
								className="font-mono"
								placeholder="column"
								value={column.name}
								onChange={(e) => update(column.id, { name: e.target.value })}
							/>
							<select
								aria-label={`Column ${index + 1} type`}
								className="h-8 rounded-lg border border-input bg-transparent px-2 font-mono text-sm dark:bg-input/30"
								value={column.type}
								onChange={(e) => update(column.id, { type: e.target.value })}
							>
								{ICEBERG_PRIMITIVE_TYPES.map((type) => (
									<option key={type} value={type}>
										{type}
									</option>
								))}
							</select>
							<span className="flex items-center gap-1.5 text-xs">
								<Checkbox
									id={`column-${column.id}-required`}
									aria-label={`Column ${index + 1} required`}
									checked={column.required}
									onCheckedChange={(checked) => update(column.id, { required: Boolean(checked) })}
								/>
								<label htmlFor={`column-${column.id}-required`}>Required</label>
							</span>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label={`Remove column ${index + 1}`}
								onClick={() => setColumns((all) => all.filter((c) => c.id !== column.id))}
							>
								<X />
							</Button>
						</motion.div>
					))}
				</AnimatePresence>
				<div className="flex items-center justify-between gap-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => setColumns((all) => [...all, blankColumn()])}
					>
						<Plus />
						Add column
					</Button>
					{problem && <span className="text-destructive text-xs">{problem}</span>}
				</div>
			</fieldset>
		</FormDialog>
	);
}
