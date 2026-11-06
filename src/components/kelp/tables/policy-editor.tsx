import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/kelp/confirm-dialog.tsx";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** Starting points for the most common resource policies. */
export function policyTemplates(resource: string) {
	return [
		{
			label: "Read only",
			policy: {
				Version: "2012-10-17",
				Statement: [
					{
						Effect: "Allow",
						Principal: { AWS: "arn:aws:iam::<account>:user/<user>" },
						Action: [
							"s3tables:GetTable",
							"s3tables:GetTableData",
							"s3tables:ListTables",
							"s3tables:GetNamespace",
						],
						Resource: [resource],
					},
				],
			},
		},
		{
			label: "Deny deletes",
			policy: {
				Version: "2012-10-17",
				Statement: [
					{
						Effect: "Deny",
						Principal: "*",
						Action: ["s3tables:DeleteTable", "s3tables:DeleteNamespace", "s3tables:DeleteTableBucket"],
						Resource: [resource],
					},
				],
			},
		},
	];
}

/** Pretty-prints JSON when it parses; leaves anything else as typed. */
export function prettyJson(text: string): string {
	try {
		return JSON.stringify(JSON.parse(text), null, 2);
	} catch {
		return text;
	}
}

/** Why `text` is not a usable policy, or null when it is. */
export function policyProblem(text: string): string | null {
	if (!text.trim()) return "Write a policy, or remove it instead.";
	try {
		const parsed = JSON.parse(text);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "A policy is a JSON object.";
		if (!Array.isArray(parsed.Statement) || parsed.Statement.length === 0)
			return "Add at least one statement.";
		return null;
	} catch (error) {
		return `Not valid JSON: ${(error as Error).message}`;
	}
}

/** JSON policy editor with live validation, templates, and save/remove. */
export function PolicyEditor({
	policy,
	resource,
	canEdit,
	onSave,
	onRemove,
}: {
	policy: string;
	/** ARN the templates should point at. */
	resource: string;
	canEdit: boolean;
	onSave: (policy: string) => Promise<unknown>;
	onRemove: () => Promise<unknown>;
}) {
	const [text, setText] = useState(() => prettyJson(policy));
	const [saving, setSaving] = useState(false);
	// Follow the saved policy when it changes.
	useEffect(() => setText(prettyJson(policy)), [policy]);
	const problem = text.trim() ? policyProblem(text) : null;
	const dirty = text.trim() !== prettyJson(policy).trim();

	if (!canEdit) {
		return policy ? (
			<pre className="max-h-80 overflow-auto rounded-lg bg-raised p-3 font-mono text-[12px]">
				{prettyJson(policy)}
			</pre>
		) : (
			<p className="text-muted-foreground text-sm">
				No policy. Access follows each identity's own permissions.
			</p>
		);
	}

	return (
		<form
			className="grid gap-2"
			onSubmit={async (event) => {
				event.preventDefault();
				setSaving(true);
				try {
					await onSave(JSON.stringify(JSON.parse(text)));
				} catch {
					// The action shows its own error.
				} finally {
					setSaving(false);
				}
			}}
		>
			<div className="flex flex-wrap items-center gap-1.5">
				<span className="mr-1 text-muted-foreground text-xs">Start from</span>
				{policyTemplates(resource).map((template) => (
					<Button
						key={template.label}
						type="button"
						variant="outline"
						size="xs"
						onClick={() => setText(JSON.stringify(template.policy, null, 2))}
					>
						{template.label}
					</Button>
				))}
				<Button
					type="button"
					variant="ghost"
					size="xs"
					className="ml-auto"
					onClick={() => setText(prettyJson(text))}
				>
					Format
				</Button>
			</div>
			<Textarea
				aria-label="Policy JSON"
				spellCheck={false}
				wrap="off"
				className="min-h-48 font-mono text-xs leading-relaxed"
				placeholder={'{\n  "Version": "2012-10-17",\n  "Statement": []\n}'}
				value={text}
				onChange={(event) => setText(event.target.value)}
				aria-invalid={Boolean(problem)}
			/>
			<p className={cn("text-xs transition-colors", problem ? "text-destructive" : "text-muted-foreground")}>
				{problem ??
					(text.trim() ? "Valid JSON policy." : "No policy. Access follows each identity's own permissions.")}
			</p>
			<div className="flex items-center justify-between gap-2">
				{policy ? (
					<ConfirmDialog
						trigger={
							<Button type="button" variant="ghost" size="sm" className="text-destructive">
								Remove policy
							</Button>
						}
						title="Remove this policy?"
						description="Access falls back to each identity's own permissions."
						confirmLabel="Remove policy"
						destructive
						onConfirm={onRemove}
					/>
				) : (
					<span />
				)}
				<Button
					type="submit"
					size="sm"
					disabled={!dirty || Boolean(problem) || !text.trim() || saving}
					pending={saving}
				>
					Save policy
				</Button>
			</div>
		</form>
	);
}
