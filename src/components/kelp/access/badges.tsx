import type { KeyStatus } from "@shared/iam.ts";
import { FileLock2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TextMorph } from "../text-morph.tsx";

/** A key's state as a status pill: a dot and a word, tinted only when it is active. */
export function KeyStatusBadge({ status }: { status: KeyStatus }) {
	const active = status === "Active";
	return (
		<span
			className={cn(
				"inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 font-medium text-[12px] transition-colors",
				active ? "bg-success/12 text-success-foreground" : "bg-secondary text-muted-foreground",
			)}
		>
			<span
				className={cn("size-1.5 rounded-full transition-colors", active ? "bg-success" : "bg-tertiary")}
			/>
			<TextMorph>{active ? "Active" : "Inactive"}</TextMorph>
		</span>
	);
}

/** Marks users defined in the S3 config file, which SeaweedFS does not let anyone edit. */
export function StaticBadge() {
	return (
		<span
			className="inline-flex h-5 shrink-0 items-center gap-1 rounded-sm bg-secondary px-1.5 text-[12px] text-muted-foreground [&_svg]:size-3"
			title="Defined in the S3 config file"
		>
			<FileLock2 />
			Config file
		</span>
	);
}

/** A compact list of names as neutral tags that collapses to "+N" past `max`. */
export function NameList({
	names,
	max = 3,
	empty = "None",
}: {
	names: string[];
	max?: number;
	empty?: string;
}) {
	if (names.length === 0) return <span className="text-tertiary">{empty}</span>;
	const shown = names.slice(0, max);
	return (
		<span className="flex flex-wrap items-center gap-1">
			{shown.map((name) => (
				<span key={name} className="inline-flex h-5 items-center rounded-sm bg-secondary px-1.5 text-[12px]">
					{name}
				</span>
			))}
			{names.length > max && <span className="text-[12px] text-muted-foreground">+{names.length - max}</span>}
		</span>
	);
}
