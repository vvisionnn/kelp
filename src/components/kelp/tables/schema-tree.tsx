import type { IcebergField } from "@shared/tables.ts";
import { ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function FieldRow({ field, depth }: { field: IcebergField; depth: number }) {
	const [open, setOpen] = useState(depth === 0);
	const nested = field.children.length > 0;
	return (
		<li>
			<div
				className="grid grid-cols-[1fr_auto] items-center gap-3 border-b py-2 text-sm last:border-b-0"
				style={{ paddingLeft: depth * 20 }}
			>
				<div className="flex min-w-0 items-center gap-1.5">
					{nested ? (
						<button
							type="button"
							className="-ml-1 flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted"
							aria-label={`${open ? "Collapse" : "Expand"} ${field.name}`}
							aria-expanded={open}
							onClick={() => setOpen(!open)}
						>
							<ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
						</button>
					) : (
						<span className="w-4" />
					)}
					<span className="truncate font-mono">{field.name}</span>
					{field.id !== null && <span className="text-muted-foreground text-xs tabular">#{field.id}</span>}
					{field.doc && <span className="truncate text-muted-foreground text-xs">— {field.doc}</span>}
				</div>
				<div className="flex items-center gap-1.5">
					<Badge variant="outline" className="font-mono">
						{field.type}
					</Badge>
					{field.required ? (
						<Badge variant="secondary">required</Badge>
					) : (
						<span className="w-[4.25rem] text-right text-muted-foreground text-xs">optional</span>
					)}
				</div>
			</div>
			<AnimatePresence initial={false}>
				{nested && open && (
					<motion.ul
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2 }}
						className="overflow-hidden"
					>
						{field.children.map((child) => (
							<FieldRow key={`${child.id}-${child.name}`} field={child} depth={depth + 1} />
						))}
					</motion.ul>
				)}
			</AnimatePresence>
		</li>
	);
}

/** Columns of an Iceberg schema, with nested structs, lists and maps expandable in place. */
export function SchemaTree({ fields }: { fields: IcebergField[] }) {
	if (!fields.length) return <p className="text-muted-foreground text-sm">This table has no columns yet.</p>;
	return (
		<ul aria-label="Columns">
			{fields.map((field) => (
				<FieldRow key={`${field.id}-${field.name}`} field={field} depth={0} />
			))}
		</ul>
	);
}
