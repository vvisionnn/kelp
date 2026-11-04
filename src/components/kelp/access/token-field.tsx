import { Plus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type KeyboardEvent, useId, useState } from "react";
import { FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface TokenFieldProps {
	label: string;
	value: string[];
	onChange: (value: string[]) => void;
	/** Quick picks shown under the input; already chosen ones are hidden. */
	suggestions?: string[];
	placeholder?: string;
	description?: string;
	disabled?: boolean;
	/** Render tokens in the mono face (identifiers such as actions). */
	mono?: boolean;
}

/** A list of short values: type and press Enter or comma, or pick a suggestion. */
export function TokenField({
	label,
	value,
	onChange,
	suggestions = [],
	placeholder = "Type and press Enter",
	description,
	disabled = false,
	mono = false,
}: TokenFieldProps) {
	const id = useId();
	const [draft, setDraft] = useState("");
	const add = (token: string) => {
		const clean = token.trim();
		if (clean && !value.includes(clean)) onChange([...value, clean]);
		setDraft("");
	};
	const remove = (token: string) => onChange(value.filter((v) => v !== token));
	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Enter" || event.key === ",") {
			event.preventDefault();
			add(draft);
		} else if (event.key === "Backspace" && !draft && value.length > 0) {
			onChange(value.slice(0, -1));
		}
	};
	const open = suggestions.filter((s) => !value.includes(s));

	return (
		<div className="grid gap-2">
			<label htmlFor={id} className="font-medium text-sm">
				{label}
			</label>
			<div
				className={cn(
					"flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border bg-transparent px-2 py-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
					disabled && "opacity-60",
				)}
			>
				<AnimatePresence initial={false}>
					{value.map((token) => (
						<motion.span
							key={token}
							layout
							initial={{ opacity: 0, scale: 0.85 }}
							animate={{ opacity: 1, scale: 1 }}
							exit={{ opacity: 0, scale: 0.85 }}
							transition={{ duration: 0.15 }}
							className={cn(
								"inline-flex items-center gap-1 rounded-md bg-secondary py-0.5 pr-1 pl-2 text-secondary-foreground text-xs",
								mono && "font-mono",
							)}
						>
							{token}
							{!disabled && (
								<button
									type="button"
									aria-label={`Remove ${token}`}
									onClick={() => remove(token)}
									className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
								>
									<X className="size-3" />
								</button>
							)}
						</motion.span>
					))}
				</AnimatePresence>
				<Input
					id={id}
					value={draft}
					disabled={disabled}
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={onKeyDown}
					onBlur={() => draft && add(draft)}
					placeholder={value.length ? "" : placeholder}
					className="h-6 min-w-32 flex-1 border-0 px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
				/>
			</div>
			{!disabled && open.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{open.map((suggestion) => (
						<button
							key={suggestion}
							type="button"
							onClick={() => add(suggestion)}
							className={cn(
								"inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-0.5 text-muted-foreground text-xs transition-colors hover:border-primary/50 hover:text-foreground",
								mono && "font-mono",
							)}
						>
							<Plus className="size-3" />
							{suggestion}
						</button>
					))}
				</div>
			)}
			{description && <FieldDescription>{description}</FieldDescription>}
		</div>
	);
}
