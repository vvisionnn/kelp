import type { IamPolicy, PolicyDocument } from "@shared/iam.ts";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Trash2, UsersRound } from "lucide-react";
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
import { AuroraCard, Panel, Reveal } from "../page.tsx";
import { Avatar } from "./identity.tsx";
import { type EditorState, formatPolicy, POLICY_TEMPLATES, PolicyEditor } from "./policy-editor.tsx";

const invalidate = [[...ACCESS_KEY]];

function UsedBy({ policy }: { policy: IamPolicy }) {
	const { users, groups } = policy.attachedTo;
	const count = users.length + groups.length;
	return (
		<section>
			<AuroraCard className="p-6">
				<h2 className="font-medium text-[15px]">Used by</h2>
				<p className="mt-6 flex items-baseline gap-2">
					<span className="font-[450] text-5xl leading-none tracking-[-0.04em] tabular">{count}</span>
					<span className="text-[13px] text-foreground/70">{count === 1 ? "attachment" : "attachments"}</span>
				</p>
				<p className="mt-2 text-[13px] text-foreground/70">Detach it everywhere before deleting.</p>
				{count === 0 ? (
					<p className="mt-5 text-sm">Not attached to anyone.</p>
				) : (
					<ul className="mt-5 flex flex-wrap gap-2 text-[13px]">
						{users.map((username) => (
							<li key={`u-${username}`}>
								<Link
									to="/access/users/$username"
									params={{ username }}
									className="flex h-8 items-center gap-2 rounded-full bg-background/60 pr-3 pl-1 backdrop-blur hover:bg-background/80"
								>
									<Avatar name={username} size="sm" className="size-6" />
									{username}
								</Link>
							</li>
						))}
						{groups.map((name) => (
							<li key={`g-${name}`}>
								<Link
									to="/access/groups/$name"
									params={{ name }}
									className="flex h-8 items-center gap-2 rounded-full bg-background/60 px-3 backdrop-blur hover:bg-background/80"
								>
									<UsersRound className="size-3.5" />
									{name}
								</Link>
							</li>
						))}
					</ul>
				)}
			</AuroraCard>
		</section>
	);
}

function Principals() {
	const { data } = useQuery(accessQueries.principals());
	if (!data || data.length === 0) return null;
	return (
		<Panel title="Principals" description="Reference these in a Principal element.">
			<ul className="grid gap-1">
				{data.map((arn) => (
					<li key={arn} className="flex items-center gap-1 rounded-sm py-0.5 pl-1 hover:bg-raised">
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
		<div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
			<Reveal>
				<div>
					<form
						className="grid gap-4"
						onSubmit={(event) => {
							event.preventDefault();
							if (state.status === "valid") save.mutate(state.document);
						}}
					>
						{!policy && (
							<div className="grid gap-4 rounded-lg bg-card p-6 sm:grid-cols-2">
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
				</div>
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
