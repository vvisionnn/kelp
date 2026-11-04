import { useQuery } from "@tanstack/react-query";
import { FileJson, ShieldOff, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/kelp/confirm-dialog.tsx";
import { ErrorState, SkeletonBlock } from "@/components/kelp/page.tsx";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/lib/mutations.ts";
import { objectApi, objectKeys, objectQueries } from "@/lib/objects-queries.ts";
import { useCanWrite } from "@/lib/session.ts";

const VERSION = "2012-10-17";

/** Starting points for common bucket policies. */
export function policyTemplates(bucket: string) {
	const objects = `arn:aws:s3:::${bucket}/*`;
	const all = [`arn:aws:s3:::${bucket}`, objects];
	return [
		{
			name: "Public read",
			description: "Anyone can download objects without credentials.",
			policy: {
				Version: VERSION,
				Statement: [
					{
						Sid: "PublicRead",
						Effect: "Allow",
						Principal: "*",
						Action: ["s3:GetObject"],
						Resource: [objects],
					},
				],
			},
		},
		{
			name: "Read-only for one user",
			description: "A single S3 identity can list and download, nothing else.",
			policy: {
				Version: VERSION,
				Statement: [
					{
						Sid: "ReadOnly",
						Effect: "Allow",
						Principal: { AWS: ["arn:aws:iam:::user/USERNAME"] },
						Action: ["s3:GetObject", "s3:ListBucket"],
						Resource: all,
					},
				],
			},
		},
		{
			name: "Read and write for one user",
			description: "A single S3 identity can list, upload, download and delete.",
			policy: {
				Version: VERSION,
				Statement: [
					{
						Sid: "ReadWrite",
						Effect: "Allow",
						Principal: { AWS: ["arn:aws:iam:::user/USERNAME"] },
						Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"],
						Resource: all,
					},
				],
			},
		},
		{
			name: "Block deletes",
			description: "Nobody can delete objects, whatever their other permissions.",
			policy: {
				Version: VERSION,
				Statement: [
					{
						Sid: "DenyDelete",
						Effect: "Deny",
						Principal: "*",
						Action: ["s3:DeleteObject"],
						Resource: [objects],
					},
				],
			},
		},
	];
}

/** Parses a policy document, or explains why it is not one. */
export function parsePolicy(text: string): { policy: Record<string, unknown> } | { problem: string } {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch (error) {
		return { problem: `Not valid JSON: ${(error as Error).message}` };
	}
	if (!value || typeof value !== "object" || Array.isArray(value))
		return { problem: "A policy is a JSON object." };
	const statements = (value as { Statement?: unknown }).Statement;
	if (!Array.isArray(statements) && (typeof statements !== "object" || statements === null)) {
		return { problem: "Add a Statement list with at least one statement." };
	}
	if (Array.isArray(statements) && statements.length === 0) return { problem: "Add at least one statement." };
	return { policy: value as Record<string, unknown> };
}

const pretty = (value: unknown) => JSON.stringify(value, null, 2);

export function PolicyEditor({ bucket }: { bucket: string }) {
	const canWrite = useCanWrite();
	const { data, isPending, error, refetch } = useQuery(objectQueries.policy(bucket));
	const saved = data?.policy ? pretty(data.policy) : (data?.invalidText ?? "");
	const [text, setText] = useState("");
	useEffect(() => setText(saved), [saved]);
	const parsed = useMemo(() => (text.trim() ? parsePolicy(text) : null), [text]);

	const save = useAction({
		run: (policy: Record<string, unknown>) => objectApi.setPolicy(bucket, policy),
		success: "Bucket policy saved",
		invalidate: [objectKeys.bucket(bucket), objectKeys.buckets],
	});
	const remove = useAction({
		run: () => objectApi.deletePolicy(bucket),
		success: "Bucket policy removed",
		invalidate: [objectKeys.bucket(bucket), objectKeys.buckets],
	});

	if (isPending) return <SkeletonBlock className="h-72 rounded-lg" />;
	if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

	const hasPolicy = Boolean(data.policy || data.invalidText);
	const dirty = text !== saved;
	const problem = parsed && "problem" in parsed ? parsed.problem : null;

	return (
		<div className="grid gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className="max-w-prose text-muted-foreground text-sm">
					{hasPolicy
						? "This policy is checked on every S3 request to the bucket, alongside each identity's own permissions."
						: "No bucket policy. Access comes only from each identity's own permissions."}
				</p>
				{canWrite && (
					<DropdownMenu>
						<DropdownMenuTrigger render={<Button variant="outline" />}>
							<Wand2 />
							Start from a template
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-72">
							<DropdownMenuGroup>
								<DropdownMenuLabel>Replaces the text in the editor</DropdownMenuLabel>
								{policyTemplates(bucket).map((template) => (
									<DropdownMenuItem
										key={template.name}
										className="grid items-start gap-0.5"
										onClick={() => setText(pretty(template.policy))}
									>
										<span className="font-medium">{template.name}</span>
										<span className="text-muted-foreground text-xs">{template.description}</span>
									</DropdownMenuItem>
								))}
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</div>

			{data.invalidText && (
				<p role="alert" className="rounded-lg bg-warning/10 px-4 py-2.5 text-[13px]">
					SeaweedFS stored a policy it cannot read. Fix it below and save, or remove it.
				</p>
			)}

			<div className="group-sheet overflow-hidden">
				<div className="flex h-9 items-center gap-2 border-border border-b px-4 text-[12px] text-muted-foreground">
					<FileJson className="size-3.5" />
					<span className="font-mono">policy.json</span>
				</div>
				<Textarea
					aria-label="Bucket policy JSON"
					value={text}
					readOnly={!canWrite}
					spellCheck={false}
					placeholder={canWrite ? "Paste a policy, or start from a template." : ""}
					className="min-h-80 resize-y rounded-none border-0 bg-transparent px-4 py-3 font-mono text-[13px] leading-relaxed shadow-none [font-variant-ligatures:none] dark:bg-transparent focus-visible:ring-0 md:text-[13px] dark:bg-transparent"
					onChange={(e) => setText(e.target.value)}
				/>
				{problem && (
					<p role="alert" className="border-border border-t px-4 py-2.5 text-[12px] text-destructive">
						{problem}
					</p>
				)}
			</div>

			{canWrite && (
				<div className="flex flex-wrap items-center gap-2">
					<Button
						disabled={!dirty || !parsed || Boolean(problem) || save.isPending}
						onClick={() => parsed && "policy" in parsed && save.mutate(parsed.policy)}
					>
						{save.isPending && <Spinner />}
						Save policy
					</Button>
					{dirty && (
						<Button variant="ghost" onClick={() => setText(saved)}>
							Discard changes
						</Button>
					)}
					{hasPolicy && (
						<ConfirmDialog
							trigger={
								<Button variant="ghost" className="ml-auto text-destructive">
									<ShieldOff />
									Remove policy
								</Button>
							}
							title="Remove the bucket policy?"
							description="Access falls back to each identity's own permissions. Public access granted by the policy stops."
							confirmLabel="Remove policy"
							destructive
							onConfirm={() => remove.mutateAsync()}
						/>
					)}
				</div>
			)}
		</div>
	);
}
