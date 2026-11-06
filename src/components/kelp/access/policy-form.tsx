import type { IamPolicy, PolicyDocument } from "@shared/iam.ts";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Trash2, UsersRound } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACCESS_KEY, accessQueries } from "@/lib/access-queries.ts";
import { api } from "@/lib/api.ts";
import { useAction } from "@/lib/mutations.ts";
import { useCanWrite } from "@/lib/session.ts";
import { ConfirmDialog } from "../confirm-dialog.tsx";
import { CopyButton } from "../copy-button.tsx";
import { Section } from "../page.tsx";
import { TextMorph } from "../text-morph.tsx";
import { Loaded, Swap } from "../transitions.tsx";
import { Avatar } from "./identity.tsx";
import { SheetRowsGhost } from "./loading.tsx";
import { type EditorState, formatPolicy, POLICY_TEMPLATES, PolicyEditor } from "./policy-editor.tsx";

const invalidate = [[...ACCESS_KEY]];

function UsedBy({ policy }: { policy: IamPolicy }) {
	const { users, groups } = policy.attachedTo;
	const count = users.length + groups.length;
	return (
		<Section
			title="Used by"
			description={
				<>
					<TextMorph className="align-top">{`${count} ${count === 1 ? "attachment" : "attachments"}`}</TextMorph>
					. Detach it everywhere before deleting.
				</>
			}
			className="mt-0 min-w-0"
		>
			<Swap id={count === 0 ? "none" : "list"}>
				{count === 0 ? (
					<p className="group-sheet px-4 py-3 text-[13px] text-muted-foreground">Not attached to anyone.</p>
				) : (
					<ul className="group-sheet divide-y divide-border text-[13px]">
						{users.map((username) => (
							<li key={`u-${username}`}>
								<Link
									to="/access/users/$username"
									params={{ username }}
									className="flex h-10 items-center gap-2.5 px-4 hover:bg-raised/70"
								>
									<Avatar name={username} />
									{username}
								</Link>
							</li>
						))}
						{groups.map((name) => (
							<li key={`g-${name}`}>
								<Link
									to="/access/groups/$name"
									params={{ name }}
									className="flex h-10 items-center gap-2.5 px-4 hover:bg-raised/70"
								>
									<span className="flex size-6 items-center justify-center rounded-full bg-secondary text-muted-foreground">
										<UsersRound className="size-3.5" />
									</span>
									{name}
								</Link>
							</li>
						))}
					</ul>
				)}
			</Swap>
		</Section>
	);
}

function Principals() {
	const principals = useQuery(accessQueries.principals());
	// Only a hint for writing documents, so a list that failed or came back empty just stays away.
	if (principals.error || principals.data?.length === 0) return null;
	return (
		<Section
			title="Principals"
			description="Reference these in a Principal element."
			className="mt-0 min-w-0"
		>
			<Loaded query={principals} skeleton={<SheetRowsGhost rows={2} />}>
				{(arns) => (
					<ul className="group-sheet divide-y divide-border">
						{arns.map((arn) => (
							<li key={arn} className="flex h-9 items-center gap-1 pr-1.5 pl-4">
								<span className="min-w-0 flex-1 truncate font-mono text-[12px]">{arn}</span>
								<CopyButton value={arn} label={`Copy ${arn}`} />
							</li>
						))}
					</ul>
				)}
			</Loaded>
		</Section>
	);
}

/** Create (no `policy`) or edit a managed policy. */
export function PolicyForm({ policy }: { policy?: IamPolicy }) {
	const navigate = useNavigate();
	const canWrite = useCanWrite();
	const [name, setName] = useState("");
	const [bucket, setBucket] = useState("my-bucket");
	const [text, setText] = useState(() =>
		formatPolicy(
			policy?.document ?? POLICY_TEMPLATES[0]?.document("my-bucket") ?? { Version: "", Statement: [] },
		),
	);
	const [state, setState] = useState<EditorState>({ status: "checking" });
	const onState = useCallback((next: EditorState) => setState(next), []);

	// A saved or outside change replaces the text in place, so the editor keeps focus and scroll.
	const revision = `${policy?.name}:${policy?.updatedAt}`;
	const [seen, setSeen] = useState(revision);
	if (revision !== seen) {
		setSeen(revision);
		if (policy) setText(formatPolicy(policy.document));
	}

	const save = useAction({
		run: (document: PolicyDocument) =>
			policy
				? api.put<{ policy: IamPolicy }>(`/iam/policies/${encodeURIComponent(policy.name)}`, { document })
				: api.post<{ policy: IamPolicy }>("/iam/policies", { name: name.trim(), document }),
		success: (result) => `Policy ${result.policy.name} ${policy ? "saved" : "created"}`,
		invalidate,
		onSuccess: (result) => {
			if (!policy) navigate({ to: "/access/policies/$name", params: { name: result.policy.name } });
		},
	});
	const remove = useAction({
		run: () => api.delete(`/iam/policies/${encodeURIComponent(policy?.name ?? "")}`),
		success: `Policy ${policy?.name} deleted`,
		invalidate,
		onSuccess: () => navigate({ to: "/access/policies" }),
	});

	const applyTemplate = (id: string, target: string) => {
		const template = POLICY_TEMPLATES.find((t) => t.id === id);
		if (template) setText(formatPolicy(template.document(target || "my-bucket")));
	};
	const unchanged = policy !== undefined && text === formatPolicy(policy.document);
	const attached = policy ? policy.attachedTo.users.length + policy.attachedTo.groups.length : 0;

	return (
		<div className="grid grid-cols-[minmax(0,1fr)] items-start gap-x-6 gap-y-8 lg:grid-cols-12">
			<div className="min-w-0 lg:col-span-8">
				<div>
					<form
						className="grid gap-4"
						onSubmit={(event) => {
							event.preventDefault();
							if (state.status === "valid") save.mutate(state.document);
						}}
					>
						{!policy && (
							<div className="group-sheet grid gap-4 p-4 sm:grid-cols-2">
								<Field>
									<FieldLabel htmlFor="policy-name">Name</FieldLabel>
									<Input
										id="policy-name"
										value={name}
										onChange={(e) => setName(e.target.value)}
										autoComplete="off"
										required
									/>
								</Field>
								<Field>
									<FieldLabel>Start from</FieldLabel>
									<div className="flex gap-2">
										<Select
											defaultValue="read-only"
											onValueChange={(id) => applyTemplate(id as string, bucket)}
										>
											<SelectTrigger aria-label="Template" className="flex-1">
												<SelectValue>
													{(value: string) => POLICY_TEMPLATES.find((t) => t.id === value)?.label}
												</SelectValue>
											</SelectTrigger>
											<SelectContent>
												{POLICY_TEMPLATES.map((template) => (
													<SelectItem key={template.id} value={template.id}>
														{template.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<Input
											aria-label="Bucket"
											value={bucket}
											onChange={(e) => {
												setBucket(e.target.value);
												setText((current) =>
													current.replaceAll(`:::${bucket}`, `:::${e.target.value || "my-bucket"}`),
												);
											}}
											className="w-36 font-mono"
										/>
									</div>
								</Field>
							</div>
						)}
						<PolicyEditor value={text} onChange={setText} onState={onState} disabled={!canWrite} />
						{canWrite && (
							<div className="flex flex-wrap items-center justify-between gap-2">
								<Swap id={policy ? (attached > 0 ? "attached" : "free") : "new"}>
									{policy && attached > 0 ? (
										<p className="text-[12px] text-muted-foreground">
											Detach it from {attached} {attached === 1 ? "place" : "places"} before deleting.
										</p>
									) : policy ? (
										<ConfirmDialog
											trigger={
												<Button
													type="button"
													variant="ghost"
													className="text-destructive"
													disabled={attached > 0}
												>
													<Trash2 />
													Delete policy
												</Button>
											}
											title={`Delete ${policy.name}?`}
											description="This cannot be undone."
											confirmLabel="Delete policy"
											destructive
											typeToConfirm={policy.name}
											onConfirm={() => remove.mutateAsync()}
										/>
									) : (
										<span />
									)}
								</Swap>
								<Button
									type="submit"
									disabled={
										state.status !== "valid" || save.isPending || unchanged || (!policy && !name.trim())
									}
									pending={save.isPending}
								>
									{policy ? "Save policy" : "Create policy"}
								</Button>
							</div>
						)}
					</form>
				</div>
			</div>
			<div className="grid min-w-0 gap-8 lg:col-span-4">
				{policy && <UsedBy policy={policy} />}
				<Principals />
			</div>
		</div>
	);
}
