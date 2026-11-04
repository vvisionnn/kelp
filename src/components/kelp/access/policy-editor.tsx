import type { PolicyDocument, PolicyValidation } from "@shared/iam.ts";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/lib/api.ts";
import { cn } from "@/lib/utils";

export type EditorState =
	| { status: "checking" }
	| { status: "valid"; document: PolicyDocument; message: string }
	| { status: "invalid"; message: string };

/** Parses the editor text locally; returns the document or the reason it is not one. */
export function parsePolicy(text: string): { document: PolicyDocument } | { error: string } {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch (error) {
		return { error: `Not valid JSON: ${(error as Error).message}` };
	}
	if (!value || typeof value !== "object" || Array.isArray(value))
		return { error: "A policy is a JSON object." };
	const doc = value as Record<string, unknown>;
	if (typeof doc.Version !== "string") return { error: 'Add a "Version", usually "2012-10-17".' };
	if (!Array.isArray(doc.Statement)) return { error: 'Add a "Statement" list.' };
	return { document: doc as PolicyDocument };
}

export const POLICY_TEMPLATES: Array<{
	id: string;
	label: string;
	document: (bucket: string) => PolicyDocument;
}> = [
	{
		id: "read-only",
		label: "Read-only bucket",
		document: (bucket) => ({
			Version: "2012-10-17",
			Statement: [
				{
					Effect: "Allow",
					Action: ["s3:GetObject", "s3:ListBucket"],
					Resource: [`arn:aws:s3:::${bucket}`, `arn:aws:s3:::${bucket}/*`],
				},
			],
		}),
	},
	{
		id: "read-write",
		label: "Read and write bucket",
		document: (bucket) => ({
			Version: "2012-10-17",
			Statement: [
				{
					Effect: "Allow",
					Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"],
					Resource: [`arn:aws:s3:::${bucket}`, `arn:aws:s3:::${bucket}/*`],
				},
			],
		}),
	},
	{
		id: "admin",
		label: "Full access",
		document: () => ({
			Version: "2012-10-17",
			Statement: [{ Effect: "Allow", Action: ["s3:*"], Resource: ["arn:aws:s3:::*"] }],
		}),
	},
];

export const formatPolicy = (document: PolicyDocument) => JSON.stringify(document, null, 2);

/**
 * A JSON editor that checks the document as you type: locally for syntax, then with SeaweedFS for
 * policy rules (debounced), reporting the first problem in plain words.
 */
export function PolicyEditor({
	value,
	onChange,
	onState,
	disabled = false,
	delayMs = 400,
}: {
	value: string;
	onChange: (value: string) => void;
	onState: (state: EditorState) => void;
	disabled?: boolean;
	delayMs?: number;
}) {
	const id = useId();
	const [state, setState] = useState<EditorState>({ status: "checking" });

	useEffect(() => {
		const update = (next: EditorState) => {
			setState(next);
			onState(next);
		};
		const parsed = parsePolicy(value);
		if ("error" in parsed) {
			update({ status: "invalid", message: parsed.error });
			return;
		}
		update({ status: "checking" });
		let cancelled = false;
		const timer = setTimeout(async () => {
			try {
				const result = await api.post<PolicyValidation>("/iam/policies/validate", {
					document: parsed.document,
				});
				if (cancelled) return;
				update(
					result.valid
						? { status: "valid", document: parsed.document, message: result.message }
						: { status: "invalid", message: result.message },
				);
			} catch (error) {
				if (!cancelled) update({ status: "invalid", message: (error as Error).message });
			}
		}, delayMs);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [value, delayMs, onState]);

	const lines = value.split("\n").length;
	const gutter = useRef<HTMLDivElement>(null);
	return (
		<div className="group-sheet overflow-hidden focus-within:ring-3 focus-within:ring-primary/25">
			<div className="flex h-9 items-center justify-between gap-3 border-border border-b px-4">
				<label htmlFor={id} className="font-semibold text-[13px]">
					Policy document
				</label>
				<span className="font-mono text-[11px] text-muted-foreground tabular">
					{lines} {lines === 1 ? "line" : "lines"}
				</span>
			</div>
			<div className="relative flex bg-raised/60">
				<div
					ref={gutter}
					aria-hidden="true"
					className="pointer-events-none w-11 shrink-0 select-none overflow-hidden py-3 pr-3 text-right font-mono text-[12px] text-tertiary leading-5 tabular"
				>
					{Array.from({ length: lines }, (_, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: line numbers are their own identity.
						<div key={index}>{index + 1}</div>
					))}
				</div>
				<textarea
					id={id}
					value={value}
					disabled={disabled}
					spellCheck={false}
					wrap="off"
					onChange={(event) => onChange(event.target.value)}
					onScroll={(event) => {
						if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop;
					}}
					aria-invalid={state.status === "invalid"}
					rows={Math.min(Math.max(lines + 1, 10), 28)}
					className="min-w-0 flex-1 resize-none bg-transparent py-3 pr-4 font-mono text-[12px] leading-5 outline-none disabled:opacity-70"
				/>
			</div>
			<div
				role="status"
				className={cn(
					"flex min-h-9 items-center gap-1.5 border-border border-t px-4 text-[12px]",
					state.status === "invalid" ? "bg-destructive/8 text-destructive" : "text-muted-foreground",
				)}
			>
				<AnimatePresence mode="wait" initial={false}>
					<motion.span
						key={state.status}
						initial={{ opacity: 0, y: 3 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -3 }}
						transition={{ duration: 0.15 }}
						className="flex items-center gap-1.5"
					>
						{state.status === "checking" && <LoaderCircle className="size-3.5 animate-spin" />}
						{state.status === "valid" && <CircleCheck className="size-3.5 text-success" />}
						{state.status === "invalid" && <CircleAlert className="size-3.5" />}
						{state.status === "checking" ? "Checking with SeaweedFS…" : state.message}
					</motion.span>
				</AnimatePresence>
			</div>
		</div>
	);
}
