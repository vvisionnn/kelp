import type { IamGroup } from "@shared/iam.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ScrollText, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import {
	ageInDays,
	groupAsIdentity,
	ROTATE_AFTER_DAYS,
	userAccess,
} from "@/components/kelp/access/analysis.ts";
import { Avatar, AvatarStack } from "@/components/kelp/access/identity.tsx";
import { ReachGrid } from "@/components/kelp/access/insights.tsx";
import {
	Expand,
	FadeText,
	HEADER_ACTION,
	InfoGhost,
	ReachGhost,
	SheetRowsGhost,
	TextGhost,
	useLanding,
} from "@/components/kelp/access/loading.tsx";
import { ConfirmDialog } from "@/components/kelp/confirm-dialog.tsx";
import { EASE, SPEED, usePrefersReducedMotion } from "@/components/kelp/motion.ts";
import { InfoList, PageHeader, Section, SkeletonBlock, StatusDot } from "@/components/kelp/page.tsx";
import { LoadingRegion } from "@/components/kelp/skeletons.tsx";
import { RollingValue, TextMorph } from "@/components/kelp/text-morph.tsx";
import { Loaded, Swap } from "@/components/kelp/transitions.tsx";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ACCESS_KEY, accessQueries } from "@/lib/access-queries.ts";
import { api } from "@/lib/api.ts";
import { useAction } from "@/lib/mutations.ts";
import { useCanWrite } from "@/lib/session.ts";

export const Route = createFileRoute("/_app/access/groups/$name")({
	staticData: { section: "Access", title: "Groups" },
	// The page's secondary queries start here too, so they land with the group and not after it.
	loader: ({ context: { queryClient }, params }) => {
		void queryClient.prefetchQuery(accessQueries.group(params.name));
		void queryClient.prefetchQuery(accessQueries.users());
		void queryClient.prefetchQuery(accessQueries.policies());
	},
	component: GroupPage,
});

const invalidate = [[...ACCESS_KEY]];

/** A list of names with remove buttons and an "add" picker, used for members and policies. */
function Roster({
	icon,
	items,
	options,
	optionsPending,
	addLabel,
	emptyText,
	editable,
	link,
	onAdd,
	onRemove,
	busy,
}: {
	icon: (item: string) => ReactNode;
	items: string[];
	options: string[];
	optionsPending: boolean;
	addLabel: string;
	emptyText: string;
	editable: boolean;
	link: (item: string) => ReactNode;
	onAdd: (item: string) => void;
	onRemove: (item: string) => void;
	busy: boolean;
}) {
	const reduced = usePrefersReducedMotion();
	const available = options.filter((o) => !items.includes(o));
	return (
		<div className="grid gap-2">
			<Swap id={items.length === 0 ? "empty" : "list"}>
				{items.length === 0 ? (
					<p className="group-sheet px-4 py-3 text-[13px] text-muted-foreground">{emptyText}</p>
				) : (
					<ul className="group-sheet divide-y divide-border">
						<AnimatePresence initial={false}>
							{items.map((item) => (
								<motion.li
									key={item}
									layout={!reduced}
									initial={reduced ? false : { opacity: 0, y: 4 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, x: -8 }}
									transition={{ duration: reduced ? 0 : SPEED.fast, ease: EASE }}
									className="flex h-10 items-center gap-2.5 pr-2 pl-4 text-[13px]"
								>
									<span className="flex text-muted-foreground [&_svg]:size-3.5">{icon(item)}</span>
									<span className="min-w-0 flex-1 truncate">{link(item)}</span>
									{editable && (
										<Button
											variant="ghost"
											size="icon-xs"
											aria-label={`Remove ${item}`}
											disabled={busy}
											onClick={() => onRemove(item)}
										>
											<X />
										</Button>
									)}
								</motion.li>
							))}
						</AnimatePresence>
					</ul>
				)}
			</Swap>
			<Expand open={editable && (optionsPending || available.length > 0)}>
				{optionsPending ? (
					<SkeletonBlock className="h-8 w-full rounded-lg" />
				) : (
					<Select value={null} onValueChange={(value) => value && onAdd(value as string)}>
						<SelectTrigger aria-label={addLabel} className="w-full">
							<SelectValue placeholder={addLabel} />
						</SelectTrigger>
						<SelectContent>
							{available.map((option) => (
								<SelectItem key={option} value={option}>
									{option}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
			</Expand>
		</div>
	);
}

function GroupPage() {
	const { name } = Route.useParams();
	const navigate = useNavigate();
	const canWrite = useCanWrite();
	const group = useQuery(accessQueries.group(name));
	const users = useQuery(accessQueries.users());
	const policies = useQuery(accessQueries.policies());
	const landed = useLanding(group, users, policies);
	const remove = useAction({
		run: () => api.delete(`/iam/groups/${encodeURIComponent(name)}`),
		success: `Group ${name} deleted`,
		invalidate,
		onSuccess: () => navigate({ to: "/access/groups" }),
	});
	const data = group.data;
	// SeaweedFS only deletes groups without members or policies.
	const empty = data?.members.length === 0 && data.policies.length === 0;

	return (
		<>
			<PageHeader
				title={name}
				description={
					data ? (
						<Swap id={data.enabled ? "enabled" : "disabled"}>
							<div className="flex">
								{data.enabled ? (
									<StatusDot tone="good" label="Enabled. Members get every attached policy." />
								) : (
									<StatusDot tone="idle" label="Disabled. Its policies grant nothing until it is enabled." />
								)}
							</div>
						</Swap>
					) : (
						!group.error && <SkeletonBlock className="my-0.5 h-3.5 w-64" />
					)
				}
				actions={
					canWrite && (
						<Swap id={data ? (empty ? "delete" : "occupied") : "pending"} className={HEADER_ACTION}>
							{data ? (
								empty ? (
									<ConfirmDialog
										trigger={
											<Button variant="destructive">
												<Trash2 />
												Delete group
											</Button>
										}
										title={`Delete ${data.name}?`}
										description="The policies attached to it are kept."
										confirmLabel="Delete group"
										destructive
										typeToConfirm={data.name}
										onConfirm={() => remove.mutateAsync()}
									/>
								) : (
									<span className="block text-[12px] text-muted-foreground leading-5">
										Remove its members and policies to delete it.
									</span>
								)
							) : (
								!group.error && <SkeletonBlock className="h-5 w-60" />
							)}
						</Swap>
					)
				}
			/>
			<Loaded query={landed} skeleton={<GroupSkeleton />}>
				{(loaded) => <GroupDetails group={loaded} canWrite={canWrite} />}
			</Loaded>
		</>
	);
}

function GroupSkeleton() {
	return (
		<LoadingRegion label="Loading group">
			<div className="grid items-start gap-x-6 gap-y-8 lg:grid-cols-12 [&>*]:min-w-0">
				<div className="grid min-w-0 grid-cols-1 gap-8 lg:col-span-8">
					<Section
						title="What this group grants"
						description={<TextGhost className="w-72" />}
						className="mt-0 min-w-0"
					>
						<div className="group-sheet p-4">
							<ReachGhost />
						</div>
					</Section>
					<Section title="Members" description={<TextGhost className="w-12" />} className="mt-0">
						<SheetRowsGhost rows={2} />
					</Section>
					<Section title="Policies" description="Every member is granted these." className="mt-0">
						<SheetRowsGhost rows={2} />
					</Section>
				</div>
				<div className="grid min-w-0 gap-8 lg:col-span-4">
					<Section title="Details" className="mt-0">
						<InfoGhost rows={3} />
					</Section>
				</div>
			</div>
		</LoadingRegion>
	);
}

function GroupDetails({ group, canWrite }: { group: IamGroup; canWrite: boolean }) {
	const { name } = group;
	const base = `/iam/groups/${encodeURIComponent(name)}`;
	const users = useQuery(accessQueries.users());
	const policies = useQuery(accessQueries.policies());
	const setEnabled = useAction({
		run: (enabled: boolean) => api.put(`${base}/status`, { enabled }),
		success: (_, enabled) => `Group ${name} ${enabled ? "enabled" : "disabled"}`,
		invalidate,
	});
	const addMember = useAction({
		run: (username: string) => api.post(`${base}/members`, { username }),
		success: (_, username) => `${username} added to ${name}`,
		invalidate,
	});
	const removeMember = useAction({
		run: (username: string) => api.delete(`${base}/members/${encodeURIComponent(username)}`),
		success: (_, username) => `${username} removed from ${name}`,
		invalidate,
	});
	const attach = useAction({
		run: (policy: string) => api.post(`${base}/policies`, { policy }),
		success: (_, policy) => `Policy ${policy} attached`,
		invalidate,
	});
	const detach = useAction({
		run: (policy: string) => api.delete(`${base}/policies/${encodeURIComponent(policy)}`),
		success: (_, policy) => `Policy ${policy} detached`,
		invalidate,
	});

	return (
		<div className="grid items-start gap-x-6 gap-y-8 lg:grid-cols-12 [&>*]:min-w-0">
			<div className="grid min-w-0 grid-cols-1 gap-8 lg:col-span-8">
				<Section
					title="What this group grants"
					description={
						<FadeText>
							{group.enabled
								? "Every member gets this access, on top of their own."
								: "The group is switched off, so it grants nothing right now."}
						</FadeText>
					}
					className="mt-0 min-w-0"
				>
					<div className="group-sheet p-4">
						<Loaded query={policies} skeleton={<ReachGhost />}>
							{(all) => (
								<ReachGrid
									grants={userAccess(groupAsIdentity(group), [], all)}
									empty={
										group.enabled
											? "Its policies reach no bucket. Attach a policy to grant access."
											: "Switch the group on to grant its policies again."
									}
								/>
							)}
						</Loaded>
					</div>
				</Section>
				<Section
					title="Members"
					description={
						<TextMorph className="align-top">{`${group.members.length} ${group.members.length === 1 ? "user" : "users"}`}</TextMorph>
					}
					className="mt-0"
				>
					<Roster
						icon={(username) => <Avatar name={username} />}
						items={group.members}
						options={(users.data ?? []).map((u) => u.username)}
						optionsPending={users.isPending}
						addLabel="Add member"
						emptyText="No members yet."
						editable={canWrite}
						busy={addMember.isPending || removeMember.isPending}
						link={(username) => (
							<Link to="/access/users/$username" params={{ username }} className="hover:underline">
								{username}
							</Link>
						)}
						onAdd={(username) => addMember.mutate(username)}
						onRemove={(username) => removeMember.mutate(username)}
					/>
				</Section>
				<Section title="Policies" description="Every member is granted these." className="mt-0">
					<Roster
						icon={() => <ScrollText />}
						items={group.policies}
						options={(policies.data ?? []).map((p) => p.name)}
						optionsPending={policies.isPending}
						addLabel="Attach policy"
						emptyText="No policies attached."
						editable={canWrite}
						busy={attach.isPending || detach.isPending}
						link={(policy) => (
							<Link to="/access/policies/$name" params={{ name: policy }} className="hover:underline">
								{policy}
							</Link>
						)}
						onAdd={(policy) => attach.mutate(policy)}
						onRemove={(policy) => detach.mutate(policy)}
					/>
				</Section>
			</div>
			<div className="grid min-w-0 gap-8 lg:col-span-4">
				<Section title="Details" className="mt-0">
					<InfoList
						items={[
							{
								label: canWrite ? <label htmlFor="group-enabled">Enabled</label> : "Status",
								value: canWrite ? (
									<Switch
										id="group-enabled"
										size="sm"
										checked={group.enabled}
										disabled={setEnabled.isPending}
										onCheckedChange={(checked) => setEnabled.mutate(checked)}
										className="align-middle"
									/>
								) : (
									<TextMorph>{group.enabled ? "Enabled" : "Disabled"}</TextMorph>
								),
							},
							{
								label: "Members",
								value:
									group.members.length > 0 ? (
										<span className="flex items-center justify-end gap-2">
											<AvatarStack names={group.members} max={5} />
											<RollingValue text={String(group.members.length)} />
										</span>
									) : (
										<RollingValue text="0" />
									),
							},
							{
								label: "Policies granted",
								value: <RollingValue text={String(group.policies.length)} />,
							},
						]}
					/>
				</Section>
				<Expand open={group.members.length > 0}>
					<Section
						title="Members' keys"
						description="Who in the group can sign, and how old their keys are."
						className="mt-0"
					>
						<Loaded query={users} skeleton={<InfoGhost rows={group.members.length} />}>
							{(everyone) => (
								<InfoList
									items={group.members.map((member) => {
										const keys = everyone.find((u) => u.username === member)?.accessKeys ?? [];
										const active = keys.filter((k) => k.status === "Active");
										const ages = active
											.map((k) => ageInDays(k.createdAt))
											.filter((a): a is number => a !== null);
										const oldest = ages.length > 0 ? Math.max(...ages) : null;
										return {
											label: (
												<Link
													to="/access/users/$username"
													params={{ username: member }}
													className="flex items-center gap-2 text-foreground hover:underline"
												>
													<Avatar name={member} />
													{member}
												</Link>
											),
											value: (
												<span
													className={
														oldest !== null && oldest >= ROTATE_AFTER_DAYS
															? "text-warning"
															: "text-muted-foreground"
													}
												>
													{active.length === 0
														? "No active key"
														: `${active.length} ${active.length === 1 ? "key" : "keys"}, ${oldest ?? "?"} days`}
												</span>
											),
										};
									})}
								/>
							)}
						</Loaded>
					</Section>
				</Expand>
			</div>
		</div>
	);
}
