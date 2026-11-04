import type { AccessKeyInfo, IamUser, KeyStatus, UpdateUserRequest } from "@shared/iam.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Bot, FileLock2, KeyRound, Trash2, UsersRound, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { KeyStatusBadge, StaticBadge } from "@/components/kelp/access/badges.tsx";
import { CreateKeyDialog } from "@/components/kelp/access/create-key-dialog.tsx";
import { Avatar } from "@/components/kelp/access/identity.tsx";
import { TokenField } from "@/components/kelp/access/token-field.tsx";
import { ConfirmDialog } from "@/components/kelp/confirm-dialog.tsx";
import { CopyButton } from "@/components/kelp/copy-button.tsx";
import {
	AuroraCard,
	EmptyState,
	ErrorState,
	Panel,
	Reveal,
	SkeletonBlock,
	StatBand,
} from "@/components/kelp/page.tsx";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ACCESS_KEY, accessQueries, BUILT_IN_ACTIONS } from "@/lib/access-queries.ts";
import { api } from "@/lib/api.ts";
import { useAction } from "@/lib/mutations.ts";
import { useCanWrite } from "@/lib/session.ts";

export const Route = createFileRoute("/_app/access/users/$username")({
	staticData: { section: "Access", title: "Users" },
	loader: ({ context, params }) =>
		void context.queryClient.prefetchQuery(accessQueries.user(params.username)),
	component: UserPage,
});

const userPath = (username: string) => `/iam/users/${encodeURIComponent(username)}`;
const invalidate = [[...ACCESS_KEY]];

function UserPage() {
	const { username } = Route.useParams();
	const navigate = useNavigate();
	const canWrite = useCanWrite();
	const { data: user, isPending, error, refetch } = useQuery(accessQueries.user(username));
	const remove = useAction({
		run: () => api.delete(userPath(username)),
		success: `User ${username} deleted`,
		invalidate,
		onSuccess: () => navigate({ to: "/access/users" }),
	});

	if (isPending) return <UserSkeleton />;
	if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

	const editable = canWrite && !user.isStatic;
	return (
		<>
			<Reveal className="pt-8 pb-10 sm:pt-12">
				<AuroraCard className="p-7 sm:p-10">
					<div className="flex flex-wrap items-start justify-between gap-6">
						<div className="flex min-w-0 items-center gap-5">
							<Avatar name={user.username} size="lg" />
							<div className="min-w-0">
								<h1 className="truncate font-[450] text-4xl leading-[1.05] tracking-[-0.03em] sm:text-5xl">
									{user.username}
								</h1>
								<p className="mt-2 flex flex-wrap items-center gap-2 text-[15px] text-foreground/70">
									{user.email || "No email"}
									{user.isStatic && <StaticBadge />}
								</p>
							</div>
						</div>
						{editable && (
							<ConfirmDialog
								trigger={
									<Button variant="destructive">
										<Trash2 />
										Delete user
									</Button>
								}
								title={`Delete ${user.username}?`}
								description="Their access keys stop working immediately. Service accounts they own are not deleted."
								confirmLabel="Delete user"
								destructive
								typeToConfirm={user.username}
								onConfirm={() => remove.mutateAsync()}
							/>
						)}
					</div>
					<StatBand
						className="mt-12"
						stats={[
							{ label: "Access keys", value: user.accessKeys.length },
							{
								label: "Active",
								value: user.accessKeys.filter((key) => key.status === "Active").length,
							},
							{ label: "Groups", value: user.groups.length },
							{ label: "Policies", value: user.policies.length },
						]}
					/>
				</AuroraCard>
				{user.isStatic && (
					<p className="mt-4 flex items-start gap-2.5 rounded-lg bg-card px-5 py-4 text-muted-foreground text-sm">
						<FileLock2 className="mt-0.5 size-4 shrink-0" />
						This user is defined in the S3 config file. Edit that file to change it; SeaweedFS keeps it
						read-only here.
					</p>
				)}
			</Reveal>
			<div className="grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
				<div className="grid gap-4">
					<Reveal delay={0.05}>
						<KeysPanel user={user} editable={editable} />
					</Reveal>
					<Reveal delay={0.08}>
						<PermissionsPanel
							key={JSON.stringify([user.email, user.actions, user.policies])}
							user={user}
							editable={editable}
						/>
					</Reveal>
				</div>
				<div className="grid gap-4">
					<Reveal delay={0.1}>
						<GroupsPanel user={user} editable={canWrite} />
					</Reveal>
					<Reveal delay={0.12}>
						<ServiceAccountsPanel username={user.username} />
					</Reveal>
				</div>
			</div>
		</>
	);
}

function UserSkeleton() {
	return (
		<div role="status" aria-busy="true" aria-label="Loading user">
			<SkeletonBlock className="mt-12 mb-10 h-64 rounded-2xl" />
			<div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
				<SkeletonBlock className="h-64 rounded-lg" />
				<SkeletonBlock className="h-40 rounded-lg" />
			</div>
		</div>
	);
}

function KeyRow({
	username,
	accessKey,
	editable,
}: {
	username: string;
	accessKey: AccessKeyInfo;
	editable: boolean;
}) {
	const keyPath = `${userPath(username)}/keys/${encodeURIComponent(accessKey.accessKey)}`;
	const setStatus = useAction({
		run: (status: KeyStatus) => api.put(keyPath, { status }),
		success: (_, status) => `Access key ${status === "Active" ? "activated" : "deactivated"}`,
		invalidate,
	});
	const remove = useAction({ run: () => api.delete(keyPath), success: "Access key deleted", invalidate });
	return (
		<motion.li
			layout
			initial={{ opacity: 0, y: 4 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, x: -8 }}
			className="flex flex-wrap items-center gap-3 rounded-md bg-raised py-2.5 pr-2.5 pl-4"
		>
			<div className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-auto">
				<KeyRound className="size-4 shrink-0 text-area" />
				<span className="truncate font-mono text-sm">{accessKey.accessKey}</span>
				<CopyButton value={accessKey.accessKey} label="Copy access key" />
			</div>
			<KeyStatusBadge status={accessKey.status} />
			{editable && (
				<>
					<Switch
						aria-label={`Active: ${accessKey.accessKey}`}
						checked={accessKey.status === "Active"}
						disabled={setStatus.isPending}
						onCheckedChange={(checked) => setStatus.mutate(checked ? "Active" : "Inactive")}
					/>
					<ConfirmDialog
						trigger={
							<Button variant="ghost" size="icon-sm" aria-label={`Delete ${accessKey.accessKey}`}>
								<Trash2 />
							</Button>
						}
						title="Delete this access key?"
						description={
							<>
								Requests signed with <span className="font-mono">{accessKey.accessKey}</span> will be
								rejected.
							</>
						}
						confirmLabel="Delete key"
						destructive
						onConfirm={() => remove.mutateAsync()}
					/>
				</>
			)}
		</motion.li>
	);
}

function KeysPanel({ user, editable }: { user: IamUser; editable: boolean }) {
	return (
		<Panel
			title="Access keys"
			description="Turn a key off to pause it without losing it."
			actions={editable && <CreateKeyDialog username={user.username} />}
		>
			{user.accessKeys.length === 0 ? (
				<EmptyState
					icon={<KeyRound />}
					title="No access keys"
					description="This user cannot sign S3 requests yet."
				/>
			) : (
				<ul className="grid gap-2">
					<AnimatePresence initial={false}>
						{user.accessKeys.map((key) => (
							<KeyRow key={key.accessKey} username={user.username} accessKey={key} editable={editable} />
						))}
					</AnimatePresence>
				</ul>
			)}
		</Panel>
	);
}

function PermissionsPanel({ user, editable }: { user: IamUser; editable: boolean }) {
	const [email, setEmail] = useState(user.email);
	const [actions, setActions] = useState(user.actions);
	const [policies, setPolicies] = useState(user.policies);
	const policyNames = useQuery({ ...accessQueries.policies(), select: (list) => list.map((p) => p.name) });
	const save = useAction({
		run: (body: UpdateUserRequest) => api.put(userPath(user.username), body),
		success: "Changes saved",
		invalidate,
	});
	const dirty =
		email.trim() !== user.email ||
		JSON.stringify(actions) !== JSON.stringify(user.actions) ||
		JSON.stringify(policies) !== JSON.stringify(user.policies);
	const reset = () => {
		setEmail(user.email);
		setActions(user.actions);
		setPolicies(user.policies);
	};

	return (
		<Panel
			title="Profile and permissions"
			description="Actions are SeaweedFS's built-in grants; policies are IAM documents."
		>
			<form
				className="grid gap-4"
				onSubmit={(event) => {
					event.preventDefault();
					save.mutate({ email: email.trim(), actions, policies });
				}}
			>
				<Field>
					<FieldLabel htmlFor="user-email">Email</FieldLabel>
					<Input
						id="user-email"
						type="email"
						value={email}
						disabled={!editable}
						onChange={(event) => setEmail(event.target.value)}
					/>
					{editable && (
						<FieldDescription>SeaweedFS keeps the current email if this is left empty.</FieldDescription>
					)}
				</Field>
				<TokenField
					label="Actions"
					value={actions}
					onChange={setActions}
					suggestions={[...BUILT_IN_ACTIONS]}
					disabled={!editable}
					mono
					description={
						editable ? "Add a bucket after a colon to limit an action, such as Write:media." : undefined
					}
				/>
				<TokenField
					label="Policies"
					value={policies}
					onChange={setPolicies}
					suggestions={policyNames.data ?? []}
					disabled={!editable}
					placeholder="Attach managed policies"
				/>
				<AnimatePresence>
					{editable && dirty && (
						<motion.div
							initial={{ opacity: 0, y: 6 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: 6 }}
							className="hairline-t flex items-center justify-end gap-2 pt-4"
						>
							<Button type="button" variant="ghost" onClick={reset}>
								Discard
							</Button>
							<Button type="submit" disabled={save.isPending}>
								{save.isPending && <Spinner />}
								Save changes
							</Button>
						</motion.div>
					)}
				</AnimatePresence>
			</form>
		</Panel>
	);
}

function GroupsPanel({ user, editable }: { user: IamUser; editable: boolean }) {
	const groups = useQuery({ ...accessQueries.groups(), enabled: editable });
	const membership = (group: string) => `/iam/groups/${encodeURIComponent(group)}/members`;
	const join = useAction({
		run: (group: string) => api.post(membership(group), { username: user.username }),
		success: (_, group) => `Added to ${group}`,
		invalidate,
	});
	const leave = useAction({
		run: (group: string) => api.delete(`${membership(group)}/${encodeURIComponent(user.username)}`),
		success: (_, group) => `Removed from ${group}`,
		invalidate,
	});
	const available = (groups.data ?? []).map((g) => g.name).filter((name) => !user.groups.includes(name));

	return (
		<Panel title="Groups" description="Members inherit every policy attached to a group.">
			<div className="grid gap-3">
				{user.groups.length === 0 ? (
					<p className="text-muted-foreground text-sm">Not in any group.</p>
				) : (
					<ul className="flex flex-wrap gap-2">
						{user.groups.map((group) => (
							<li
								key={group}
								className="flex h-8 items-center gap-1.5 rounded-full bg-secondary pr-1 pl-3 text-[13px]"
							>
								<UsersRound className="size-3.5 text-area" />
								<Link to="/access/groups/$name" params={{ name: group }} className="hover:underline">
									{group}
								</Link>
								{editable && (
									<Button
										variant="ghost"
										size="icon-xs"
										aria-label={`Remove from ${group}`}
										disabled={leave.isPending}
										onClick={() => leave.mutate(group)}
									>
										<X />
									</Button>
								)}
							</li>
						))}
					</ul>
				)}
				{editable && available.length > 0 && (
					<Select value={null} onValueChange={(group) => group && join.mutate(group as string)}>
						<SelectTrigger aria-label="Add to group" className="w-full">
							<SelectValue placeholder="Add to group" />
						</SelectTrigger>
						<SelectContent>
							{available.map((name) => (
								<SelectItem key={name} value={name}>
									{name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
			</div>
		</Panel>
	);
}

function ServiceAccountsPanel({ username }: { username: string }) {
	const { data } = useQuery({
		...accessQueries.serviceAccounts(),
		select: (accounts) => accounts.filter((a) => a.parentUser === username),
	});
	return (
		<Panel title="Service accounts" description="Separate keys that act on this user's behalf.">
			{!data || data.length === 0 ? (
				<p className="text-muted-foreground text-sm">None.</p>
			) : (
				<ul className="grid gap-2">
					{data.map((account) => (
						<li
							key={account.id}
							className="flex items-center gap-2.5 rounded-md bg-raised px-3.5 py-2.5 text-sm"
						>
							<Bot className="size-4 text-area" />
							<Link
								to="/access/service-accounts"
								search={{ account: account.id }}
								className="min-w-0 flex-1 truncate hover:underline"
							>
								{account.description || account.id}
							</Link>
							<KeyStatusBadge status={account.status} />
						</li>
					))}
				</ul>
			)}
		</Panel>
	);
}
