import type { IamGroup } from "@shared/iam.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, UsersRound } from "lucide-react";
import { type FormEvent, useState } from "react";
import { NameList } from "@/components/kelp/access/badges.tsx";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import { EmptyState, PageHeader, Reveal, StatusDot } from "@/components/kelp/page.tsx";
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
import { useCanWrite } from "@/lib/session.ts";

export const Route = createFileRoute("/_app/access/groups/")({
	staticData: { section: "Access", title: "Groups" },
	loader: ({ context }) => context.queryClient.prefetchQuery(accessQueries.groups()),
	component: GroupsPage,
});

const columns: Array<Column<IamGroup>> = [
	{
		accessorKey: "name",
		header: "Group",
		cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
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
		cell: ({ row }) => <NameList names={row.original.members} empty="No members" />,
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

function GroupsPage() {
	const navigate = useNavigate();
	const canWrite = useCanWrite();
	const { data, isPending, error, refetch } = useQuery(accessQueries.groups());
	return (
		<>
			<PageHeader
				title="Groups"
				description="Share policies across users. A disabled group grants nothing."
				actions={canWrite && <CreateGroupDialog />}
			/>
			<Reveal>
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
