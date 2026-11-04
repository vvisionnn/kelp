import type { IamPolicy, PolicyDocument } from "@shared/iam.ts";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Trash2, User, UsersRound } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ACCESS_KEY, accessQueries } from "@/lib/access-queries.ts";
import { api } from "@/lib/api.ts";
import { useAction } from "@/lib/mutations.ts";
import { useCanWrite } from "@/lib/session.ts";
import { ConfirmDialog } from "../confirm-dialog.tsx";
import { CopyButton } from "../copy-button.tsx";
import { Panel, Reveal } from "../page.tsx";
import { type EditorState, formatPolicy, POLICY_TEMPLATES, PolicyEditor } from "./policy-editor.tsx";

const invalidate = [[...ACCESS_KEY]];

function UsedBy({ policy }: { policy: IamPolicy }) {
	const { users, groups } = policy.attachedTo;
	return (
		<Panel title="Used by" description="Detach it everywhere before deleting.">
			{users.length + groups.length === 0 ? (
				<p className="text-muted-foreground text-sm">Not attached to anyone.</p>
			) : (
				<ul className="grid gap-2 text-sm">
					{users.map((username) => (
						<li key={`u-${username}`} className="flex items-center gap-2">
							<User className="size-3.5 text-muted-foreground" />
							<Link to="/access/users/$username" params={{ username }} className="font-mono hover:underline">
								{username}
							</Link>
						</li>
					))}
					{groups.map((name) => (
						<li key={`g-${name}`} className="flex items-center gap-2">
							<UsersRound className="size-3.5 text-muted-foreground" />
							<Link to="/access/groups/$name" params={{ name }} className="hover:underline">
								{name}
							</Link>
						</li>
					))}
				</ul>
			)}
		</Panel>
	);
}

function Principals() {
	const { data } = useQuery(accessQueries.principals());
	if (!data || data.length === 0) return null;
	return (
		<Panel title="Principals" description="Reference these in a Principal element.">
			<ul className="grid gap-1">
				{data.map((arn) => (
					<li key={arn} className="flex items-center gap-1">
						<span className="min-w-0 flex-1 truncate font-mono text-xs">{arn}</span>
						<CopyButton value={arn} label={`Copy ${arn}`} />
					</li>
				))}
			</ul>
		</Panel>
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
		<div className="grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
			<Reveal>
				<Panel>
					<form
						className="grid gap-4"
						onSubmit={(event) => {
							event.preventDefault();
							if (state.status === "valid") save.mutate(state.document);
						}}
					>
						{!policy && (
							<div className="grid gap-4 sm:grid-cols-2">
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
											className="w-32 font-mono"
										/>
									</div>
								</Field>
							</div>
						)}
						<PolicyEditor value={text} onChange={setText} onState={onState} disabled={!canWrite} />
						{canWrite && (
							<div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
								{policy && attached > 0 ? (
									<p className="text-muted-foreground text-xs">
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
								<Button
									type="submit"
									disabled={
										state.status !== "valid" || save.isPending || unchanged || (!policy && !name.trim())
									}
								>
									{save.isPending && <Spinner />}
									{policy ? "Save policy" : "Create policy"}
								</Button>
							</div>
						)}
					</form>
				</Panel>
			</Reveal>
			<div className="grid gap-4">
				{policy && (
					<Reveal delay={0.05}>
						<UsedBy policy={policy} />
					</Reveal>
				)}
				<Reveal delay={0.08}>
					<Principals />
				</Reveal>
			</div>
		</div>
	);
}
