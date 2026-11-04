import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ScrollText, Trash2, User, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { ConfirmDialog } from "@/components/kelp/confirm-dialog.tsx";
import { ErrorState, PageHeader, Panel, Reveal, SkeletonBlock, StatusDot } from "@/components/kelp/page.tsx";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ACCESS_KEY, accessQueries } from "@/lib/access-queries.ts";
import { api } from "@/lib/api.ts";
import { useAction } from "@/lib/mutations.ts";
import { useCanWrite } from "@/lib/session.ts";

export const Route = createFileRoute("/_app/access/groups/$name")({
	staticData: { section: "Access", title: "Groups" },
	loader: ({ context, params }) => context.queryClient.prefetchQuery(accessQueries.group(params.name)),
	component: GroupPage,
});

const invalidate = [[...ACCESS_KEY]];

/** A list of names with remove buttons and an "add" picker, used for members and policies. */
function Roster({
	icon,
	items,
	options,
	addLabel,
	emptyText,
	editable,
	link,
	onAdd,
	onRemove,
	busy,
}: {
	icon: ReactNode;
	items: string[];
	options: string[];
	addLabel: string;
	emptyText: string;
	editable: boolean;
	link: (item: string) => ReactNode;
	onAdd: (item: string) => void;
	onRemove: (item: string) => void;
	busy: boolean;
}) {
	const available = options.filter((o) => !items.includes(o));
	return (
		<div className="grid gap-3">
			{items.length === 0 ? (
				<p className="text-muted-foreground text-sm">{emptyText}</p>
			) : (
				<ul className="-my-2 divide-y">
					<AnimatePresence initial={false}>
						{items.map((item) => (
							<motion.li
								key={item}
								layout
								initial={{ opacity: 0, y: 4 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, x: -8 }}
								className="flex items-center gap-2 py-2 text-sm"
							>
								<span className="text-muted-foreground [&_svg]:size-3.5">{icon}</span>
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
			{editable && available.length > 0 && (
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
		</div>
	);
}

function GroupPage() {
	const { name } = Route.useParams();
	const navigate = useNavigate();
	const canWrite = useCanWrite();
	const base = `/iam/groups/${encodeURIComponent(name)}`;
	const { data: group, isPending, error, refetch } = useQuery(accessQueries.group(name));
	const users = useQuery({
		...accessQueries.users(),
		enabled: canWrite,
		select: (l) => l.map((u) => u.username),
	});
	const policies = useQuery({
		...accessQueries.policies(),
		enabled: canWrite,
		select: (l) => l.map((p) => p.name),
	});

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
	const remove = useAction({
		run: () => api.delete(base),
		success: `Group ${name} deleted`,
		invalidate,
		onSuccess: () => navigate({ to: "/access/groups" }),
	});

	if (isPending)
		return (
			<div role="status" aria-busy="true" aria-label="Loading group">
				<SkeletonBlock className="mt-2 mb-6 h-8 w-48" />
				<SkeletonBlock className="h-56 rounded-xl" />
			</div>
		);
	if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

	// SeaweedFS only deletes groups without members or policies.
	const empty = group.members.length === 0 && group.policies.length === 0;
	return (
		<>
			<PageHeader
				title={group.name}
				description={
					group.enabled ? (
						<StatusDot tone="good" label="Enabled. Members get every attached policy." />
					) : (
						<StatusDot tone="idle" label="Disabled. Its policies grant nothing until it is enabled." />
					)
				}
				actions={
					canWrite && (
						<>
							<div className="flex items-center gap-2 text-sm">
								<Switch
									id="group-enabled"
									checked={group.enabled}
									disabled={setEnabled.isPending}
									onCheckedChange={(checked) => setEnabled.mutate(checked)}
								/>
								<label htmlFor="group-enabled">Enabled</label>
							</div>
							{empty ? (
								<ConfirmDialog
									trigger={
										<Button variant="destructive">
											<Trash2 />
											Delete group
										</Button>
									}
									title={`Delete ${group.name}?`}
									description="The policies attached to it are kept."
									confirmLabel="Delete group"
									destructive
									typeToConfirm={group.name}
									onConfirm={() => remove.mutateAsync()}
								/>
							) : (
								<span className="max-w-48 text-muted-foreground text-xs">
									Remove its members and policies to delete it.
								</span>
							)}
						</>
					)
				}
			/>
			<div className="grid items-start gap-4 lg:grid-cols-2">
				<Reveal>
					<Panel
						title="Members"
						description={`${group.members.length} ${group.members.length === 1 ? "user" : "users"}`}
					>
						<Roster
							icon={<User />}
							items={group.members}
							options={users.data ?? []}
							addLabel="Add member"
							emptyText="No members yet."
							editable={canWrite}
							busy={addMember.isPending || removeMember.isPending}
							link={(username) => (
								<Link
									to="/access/users/$username"
									params={{ username }}
									className="font-mono hover:underline"
								>
									{username}
								</Link>
							)}
							onAdd={(username) => addMember.mutate(username)}
							onRemove={(username) => removeMember.mutate(username)}
						/>
					</Panel>
				</Reveal>
				<Reveal delay={0.05}>
					<Panel title="Policies" description="Every member is granted these.">
						<Roster
							icon={<ScrollText />}
							items={group.policies}
							options={policies.data ?? []}
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
					</Panel>
				</Reveal>
			</div>
		</>
	);
}
