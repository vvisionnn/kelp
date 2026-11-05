import type { IamGroup, IamPolicy, IamUser } from "@shared/iam.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus, UsersRound } from "lucide-react";
import { type FormEvent, useState } from "react";
import { accessMatrix, groupAsIdentity } from "@/components/kelp/access/analysis.ts";
import { NameList } from "@/components/kelp/access/badges.tsx";
import { AccessMatrixView } from "@/components/kelp/access/insights.tsx";
import { BarList, dataColor, Kpi } from "@/components/kelp/charts/index.ts";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import { EmptyState, PageHeader, Panel, Reveal, StatusDot } from "@/components/kelp/page.tsx";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ACCESS_KEY, accessQueries } from "@/lib/access-queries.ts";
import { api } from "@/lib/api.ts";
import { useAction } from "@/lib/mutations.ts";
import { objectQueries } from "@/lib/objects-queries.ts";
import { useCanWrite } from "@/lib/session.ts";

export const Route = createFileRoute("/_app/access/groups/")({
	staticData: { section: "Access", title: "Groups" },
	loader: ({ context }) => void context.queryClient.prefetchQuery(accessQueries.groups()),
	component: GroupsPage,
});

const columns: Array<Column<IamGroup>> = [
	{
		accessorKey: "name",
		header: "Group",
		cell: ({ row }) => (
			<span className="flex items-center gap-3">
				<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground [&_svg]:size-3.5">
					<UsersRound />
				</span>
				<span className="font-medium">{row.original.name}</span>
			</span>
		),
	},
	{
		id: "status",
		accessorFn: (group) => (group.enabled ? "Enabled" : "Disabled"),
		header: "Status",
		cell: ({ row }) =>
			row.original.enabled ? (
				<StatusDot tone="good" label="Enabled" />
			) : (
				<StatusDot tone="idle" label="Disabled" />
			),
	},
	{
		id: "members",
		accessorFn: (group) => group.members.length,
		header: "Members",
		cell: ({ row }) =>
			row.original.members.length === 0 ? (
				<span className="text-muted-foreground">No members</span>
			) : (
				<NameList names={row.original.members} max={3} />
			),
	},
	{
		id: "policies",
		accessorFn: (group) => group.policies.length,
		header: "Policies",
		cell: ({ row }) => <NameList names={row.original.policies} empty="No policies" />,
	},
];

function CreateGroupDialog() {
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const create = useAction({
		run: (groupName: string) => api.post<{ group: IamGroup }>("/iam/groups", { name: groupName }),
		success: (_, groupName) => `Group ${groupName} created`,
		invalidate: [[...ACCESS_KEY]],
		onSuccess: ({ group }) => {
			setOpen(false);
			setName("");
			navigate({ to: "/access/groups/$name", params: { name: group.name } });
		},
	});
	const submit = (event: FormEvent) => {
		event.preventDefault();
		create.mutate(name.trim());
	};
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger render={<Button />}>
				<Plus />
				Create group
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create group</DialogTitle>
					<DialogDescription>Attach policies to a group once, then add users to it.</DialogDescription>
				</DialogHeader>
				<form onSubmit={submit} className="grid gap-4">
					<Field>
						<FieldLabel htmlFor="group-name">Name</FieldLabel>
						<Input
							id="group-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							autoComplete="off"
							required
						/>
					</Field>
					<DialogFooter>
						<Button type="submit" disabled={!name.trim() || create.isPending}>
							{create.isPending && <Spinner />}
							Create group
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

/** Headline numbers for the groups page. */
export function groupStats(groups: IamGroup[], users: IamUser[]) {
	const members = new Set(groups.flatMap((group) => group.members));
	return {
		groups: groups.length,
		off: groups.filter((group) => !group.enabled).length,
		memberships: groups.reduce((sum, group) => sum + group.members.length, 0),
		outside: users.filter((user) => !members.has(user.username)).map((user) => user.username),
		attached: groups.reduce((sum, group) => sum + group.policies.length, 0),
	};
}

function GroupsDashboard({
	groups,
	users,
	policies,
	buckets,
}: {
	groups: IamGroup[];
	users: IamUser[];
	policies: IamPolicy[];
	buckets: string[];
}) {
	const stats = groupStats(groups, users);
	const matrix = accessMatrix(groups.map(groupAsIdentity), [], policies, buckets);
	const shared = new Set(
		matrix.rows.flatMap((row) =>
			Object.entries(row.cells)
				.filter(([, c]) => c.level)
				.map(([b]) => b),
		),
	);
	return (
		<>
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				<Kpi
					label="Groups"
					value={String(stats.groups)}
					hint={stats.off > 0 ? `${stats.off} switched off` : "All switched on"}
				/>
				<Kpi
					label="Memberships"
					value={String(stats.memberships)}
					hint={`${stats.attached} policies attached`}
				/>
				<Kpi
					label="Users in no group"
					value={String(stats.outside.length)}
					hint={stats.outside.length > 0 ? stats.outside.join(", ") : "Everyone belongs to a group"}
				/>
				<Kpi label="Buckets shared" value={String(shared.size)} hint="Reached through a group policy" />
			</div>
			<div className="mt-3 grid items-start gap-3 xl:grid-cols-12">
				<Panel
					title="What each group grants"
					description="The strongest access a group's policies give its members, per bucket"
					className="min-w-0 xl:col-span-8"
				>
					<AccessMatrixView matrix={matrix} rows="group" />
				</Panel>
				<Panel title="Members per group" className="xl:col-span-4">
					<BarList
						label="Groups by members"
						color={dataColor(0)}
						items={[...groups]
							.sort((a, b) => b.members.length - a.members.length)
							.map((group) => ({
								key: group.name,
								label: (
									<Link to="/access/groups/$name" params={{ name: group.name }} className="hover:underline">
										{group.name}
									</Link>
								),
								value: group.members.length,
								display: `${group.members.length} ${group.members.length === 1 ? "member" : "members"}`,
							}))}
					/>
				</Panel>
			</div>
		</>
	);
}

function GroupsPage() {
	const navigate = useNavigate();
	const canWrite = useCanWrite();
	const { data, isPending, error, refetch } = useQuery(accessQueries.groups());
	const users = useQuery(accessQueries.users()).data;
	const policies = useQuery(accessQueries.policies()).data;
	const buckets = useQuery(objectQueries.buckets()).data;
	return (
		<>
			<PageHeader
				title="Groups"
				description="Share policies across users. A disabled group grants nothing."
				actions={canWrite && <CreateGroupDialog />}
			/>
			{data && data.length > 0 && users && policies && (
				<Reveal className="mb-8">
					<GroupsDashboard
						groups={data}
						users={users}
						policies={policies}
						buckets={(buckets ?? []).map((b) => b.name)}
					/>
				</Reveal>
			)}
			<Reveal delay={0.05}>
				<DataTable
					data={data}
					isLoading={isPending}
					error={error}
					onRetry={() => refetch()}
					getRowId={(group) => group.name}
					searchText={(group) => `${group.name} ${group.members.join(" ")} ${group.policies.join(" ")}`}
					searchPlaceholder="Search groups, members or policies"
					onRowClick={(group) => navigate({ to: "/access/groups/$name", params: { name: group.name } })}
					empty={
						<EmptyState
							icon={<UsersRound />}
							title="No groups yet"
							description="Groups let many users share the same policies."
							{...(canWrite ? { action: <CreateGroupDialog /> } : {})}
						/>
					}
					columns={columns}
				/>
			</Reveal>
		</>
	);
}
