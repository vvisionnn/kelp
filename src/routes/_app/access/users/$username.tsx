import type { AccessKeyInfo, IamUser, KeyStatus, UpdateUserRequest } from "@shared/iam.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Bot, FileLock2, KeyRound, Trash2, UsersRound, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import {
	ALL_BUCKETS,
	ageInDays,
	type BucketGrant,
	LEVEL_LABEL,
	levelOf,
	ROTATE_AFTER_DAYS,
	userAccess,
} from "@/components/kelp/access/analysis.ts";
import { KeyStatusBadge, StaticBadge } from "@/components/kelp/access/badges.tsx";
import { CreateKeyDialog } from "@/components/kelp/access/create-key-dialog.tsx";
import { Avatar } from "@/components/kelp/access/identity.tsx";
import { ReachGrid } from "@/components/kelp/access/insights.tsx";
import { TokenField } from "@/components/kelp/access/token-field.tsx";
import { Kpi } from "@/components/kelp/charts/index.ts";
import { ConfirmDialog } from "@/components/kelp/confirm-dialog.tsx";
import { CopyButton } from "@/components/kelp/copy-button.tsx";
import {
	EmptyState,
	ErrorState,
	InfoList,
	PageHeader,
	Reveal,
	Section,
	SkeletonBlock,
} from "@/components/kelp/page.tsx";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
	const groups = useQuery(accessQueries.groups()).data;
	const policies = useQuery(accessQueries.policies()).data;
	const remove = useAction({
		run: () => api.delete(userPath(username)),
		success: `User ${username} deleted`,
		invalidate,
		onSuccess: () => navigate({ to: "/access/users" }),
	});

	if (isPending) return <UserSkeleton />;
	if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

	const editable = canWrite && !user.isStatic;
	const active = user.accessKeys.filter((key) => key.status === "Active").length;
	return (
		<>
			<PageHeader
				title={user.username}
				description={`${user.email || "No email"}, ${plural(user.accessKeys.length, "access key")}, ${plural(user.groups.length, "group")}`}
				actions={
					editable && (
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
					)
				}
			/>
			{user.isStatic && (
				<p className="mb-6 flex items-start gap-2 rounded-lg bg-secondary px-3.5 py-2.5 text-[13px] text-muted-foreground">
					<FileLock2 className="mt-px size-4 shrink-0" />
					This user is defined in the S3 config file. Edit that file to change it; SeaweedFS keeps it
					read-only here.
				</p>
			)}
			{groups && policies && <UserReachStats user={user} grants={userAccess(user, groups, policies)} />}
			<Reveal className="grid items-start gap-x-6 gap-y-8 lg:grid-cols-12 [&>*]:min-w-0">
				<div className="grid min-w-0 grid-cols-1 gap-8 lg:col-span-8">
					{groups && policies && (
						<Section
							title={`What ${user.username} can reach`}
							description="Combined from direct actions, attached policies and group policies, after denies."
							className="mt-0 min-w-0"
						>
							<div className="group-sheet p-4">
								<ReachGrid
									grants={userAccess(user, groups, policies)}
									empty="No action, policy or group gives this user access to any bucket."
								/>
							</div>
						</Section>
					)}
					<KeysSection user={user} editable={editable} />
					<PermissionsSection
						key={JSON.stringify([user.email, user.actions, user.policies])}
						user={user}
						editable={editable}
					/>
				</div>
				<div className="grid min-w-0 gap-8 lg:col-span-4">
					<Section title="Details" className="mt-0">
						<InfoList
							items={[
								{
									label: "User",
									value: (
										<span className="flex items-center justify-end gap-2">
											<Avatar name={user.username} />
											{user.username}
										</span>
									),
								},
								{ label: "Email", value: user.email || <span className="text-tertiary">None</span> },
								{ label: "Keys that can sign", value: <span className="tabular">{active}</span> },
								{ label: "Policies", value: <span className="tabular">{user.policies.length}</span> },
								{ label: "Defined in", value: user.isStatic ? <StaticBadge /> : "Kelp and the admin API" },
							]}
						/>
					</Section>
					<GroupsSection user={user} editable={canWrite} />
					<ServiceAccountsSection username={user.username} />
				</div>
			</Reveal>
		</>
	);
}

/** The user's reach and key health at a glance. */
function UserReachStats({ user, grants }: { user: IamUser; grants: BucketGrant[] }) {
	const all = grants.find((g) => g.bucket === ALL_BUCKETS);
	const named = grants.filter((g) => g.bucket !== ALL_BUCKETS);
	const changes = grants.filter((g) => ["write", "admin"].includes(levelOf(g.capabilities) ?? ""));
	const active = user.accessKeys.filter((k) => k.status === "Active");
	const ages = active.map((k) => ageInDays(k.createdAt)).filter((a): a is number => a !== null);
	const oldest = ages.length > 0 ? Math.max(...ages) : null;
	return (
		<Reveal className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
			<Kpi
				label="Buckets reached"
				value={all ? "All" : String(named.length)}
				hint={
					all
						? `${LEVEL_LABEL[levelOf(all.capabilities) ?? "list"]} on every bucket`
						: "Through actions, policies and groups"
				}
			/>
			<Kpi
				label="Can change"
				value={
					all && ["write", "admin"].includes(levelOf(all.capabilities) ?? "") ? "All" : String(changes.length)
				}
				hint="Buckets it can write to or delete from"
			/>
			<Kpi
				label="Keys that can sign"
				value={String(active.length)}
				hint={`${user.accessKeys.length - active.length} paused`}
			/>
			<Kpi
				label="Oldest active key"
				value={oldest === null ? "–" : String(oldest)}
				{...(oldest === null ? {} : { unit: oldest === 1 ? "day" : "days" })}
				hint={
					oldest !== null && oldest >= ROTATE_AFTER_DAYS
						? "Time to rotate"
						: `Rotate after ${ROTATE_AFTER_DAYS} days`
				}
				{...(oldest !== null && oldest >= ROTATE_AFTER_DAYS ? { tone: "warn" as const } : {})}
			/>
		</Reveal>
	);
}

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function UserSkeleton() {
	return (
		<div role="status" aria-busy="true" aria-label="Loading user">
			<div className="flex items-center gap-3 pt-2 pb-6">
				<SkeletonBlock className="size-9 rounded-[9px]" />
				<div className="space-y-1.5">
					<SkeletonBlock className="h-7 w-40" />
					<SkeletonBlock className="h-4 w-64" />
				</div>
			</div>
			<div className="grid gap-6 lg:grid-cols-12">
				<SkeletonBlock className="h-64 rounded-xl lg:col-span-8" />
				<SkeletonBlock className="h-48 rounded-xl lg:col-span-4" />
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
			className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-1.5 pr-2 pl-4"
		>
			<div className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-auto">
				<KeyRound className="size-3.5 shrink-0 text-muted-foreground" />
				<span className="truncate font-mono text-[13px]">{accessKey.accessKey}</span>
				<CopyButton value={accessKey.accessKey} label="Copy access key" />
				{ageInDays(accessKey.createdAt) !== null && (
					<span className="shrink-0 text-[12px] text-muted-foreground">
						{ageInDays(accessKey.createdAt) === 0
							? "created today"
							: `${ageInDays(accessKey.createdAt)} days old`}
					</span>
				)}
			</div>
			<KeyStatusBadge status={accessKey.status} />
			{editable && (
				<>
					<Switch
						aria-label={`Active: ${accessKey.accessKey}`}
						size="sm"
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

function KeysSection({ user, editable }: { user: IamUser; editable: boolean }) {
	return (
		<Section
			title="Access keys"
			description="Turn a key off to pause it without losing it."
			actions={editable && <CreateKeyDialog username={user.username} />}
			className="mt-0"
		>
			{user.accessKeys.length === 0 ? (
				<EmptyState
					icon={<KeyRound />}
					title="No access keys"
					description="This user cannot sign S3 requests yet."
				/>
			) : (
				<ul className="group-sheet divide-y divide-border">
					<AnimatePresence initial={false}>
						{user.accessKeys.map((key) => (
							<KeyRow key={key.accessKey} username={user.username} accessKey={key} editable={editable} />
						))}
					</AnimatePresence>
				</ul>
			)}
		</Section>
	);
}

function PermissionsSection({ user, editable }: { user: IamUser; editable: boolean }) {
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
		<Section
			title="Profile and permissions"
			description="Actions are SeaweedFS's built-in grants; policies are IAM documents."
			className="mt-0"
		>
			<form
				className="group-sheet divide-y divide-border [&>*]:px-4 [&>*]:py-3.5"
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
							className="flex items-center justify-end gap-2 bg-raised/50"
						>
							<Button type="button" variant="ghost" onClick={reset}>
								Discard
							</Button>
							<Button type="submit" disabled={save.isPending} pending={save.isPending}>
								Save changes
							</Button>
						</motion.div>
					)}
				</AnimatePresence>
			</form>
		</Section>
	);
}

function GroupsSection({ user, editable }: { user: IamUser; editable: boolean }) {
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
		<Section title="Groups" description="Members inherit every policy attached to a group." className="mt-0">
			<div className="grid gap-2">
				{user.groups.length === 0 ? (
					<p className="group-sheet px-4 py-3 text-[13px] text-muted-foreground">Not in any group.</p>
				) : (
					<ul className="group-sheet divide-y divide-border">
						{user.groups.map((group) => (
							<li key={group} className="flex h-10 items-center gap-2.5 pr-2 pl-4 text-[13px]">
								<UsersRound className="size-3.5 text-muted-foreground" />
								<Link
									to="/access/groups/$name"
									params={{ name: group }}
									className="min-w-0 flex-1 truncate hover:underline"
								>
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
		</Section>
	);
}

function ServiceAccountsSection({ username }: { username: string }) {
	const { data } = useQuery({
		...accessQueries.serviceAccounts(),
		select: (accounts) => accounts.filter((a) => a.parentUser === username),
	});
	return (
		<Section
			title="Service accounts"
			description="Separate keys that act on this user's behalf."
			className="mt-0"
		>
			{!data || data.length === 0 ? (
				<p className="group-sheet px-4 py-3 text-[13px] text-muted-foreground">None.</p>
			) : (
				<ul className="group-sheet divide-y divide-border">
					{data.map((account) => (
						<li key={account.id} className="flex h-10 items-center gap-2.5 px-4 text-[13px]">
							<Bot className="size-3.5 text-muted-foreground" />
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
		</Section>
	);
}
