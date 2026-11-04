import type { IamUser } from "@shared/iam.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { NameList, StaticBadge } from "@/components/kelp/access/badges.tsx";
import { CreateUserDialog } from "@/components/kelp/access/create-user-dialog.tsx";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import { EmptyState, PageHeader, Reveal } from "@/components/kelp/page.tsx";
import { accessQueries, describeActions } from "@/lib/access-queries.ts";
import { useCanWrite } from "@/lib/session.ts";

export const Route = createFileRoute("/_app/access/users/")({
	staticData: { section: "Access", title: "Users" },
	loader: ({ context }) => context.queryClient.prefetchQuery(accessQueries.users()),
	component: UsersPage,
});

export const userColumns: Array<Column<IamUser>> = [
	{
		accessorKey: "username",
		header: "User",
		cell: ({ row }) => (
			<div className="min-w-0">
				<p className="flex items-center gap-2 font-medium">
					<span className="truncate font-mono">{row.original.username}</span>
					{row.original.isStatic && <StaticBadge />}
				</p>
				<p className="truncate text-muted-foreground text-xs">{row.original.email || "No email"}</p>
			</div>
		),
		size: 240,
	},
	{
		id: "keys",
		accessorFn: (user) => user.accessKeys.length,
		header: "Access keys",
		cell: ({ row }) => {
			const keys = row.original.accessKeys;
			const inactive = keys.filter((k) => k.status === "Inactive").length;
			return (
				<span className="tabular">
					{keys.length}
					{inactive > 0 && <span className="text-muted-foreground text-xs"> ({inactive} inactive)</span>}
				</span>
			);
		},
	},
	{
		id: "permissions",
		accessorFn: (user) => describeActions(user.actions),
		header: "Permissions",
		cell: ({ row }) => <span className="text-sm">{describeActions(row.original.actions)}</span>,
		size: 220,
	},
	{
		id: "policies",
		accessorFn: (user) => user.policies.join(" "),
		header: "Policies",
		cell: ({ row }) => <NameList names={row.original.policies} />,
	},
	{
		id: "groups",
		accessorFn: (user) => user.groups.join(" "),
		header: "Groups",
		cell: ({ row }) => <NameList names={row.original.groups} />,
	},
];

function UsersPage() {
	const navigate = useNavigate();
	const canWrite = useCanWrite();
	const { data, isPending, error, refetch } = useQuery(accessQueries.users());
	return (
		<>
			<PageHeader
				title="Users"
				description="People and apps that sign S3 requests with access keys."
				actions={canWrite && <CreateUserDialog />}
			/>
			<Reveal>
				<DataTable
					data={data}
					isLoading={isPending}
					error={error}
					onRetry={() => refetch()}
					getRowId={(user) => user.username}
					searchText={(user) =>
						`${user.username} ${user.email} ${user.groups.join(" ")} ${user.policies.join(" ")} ${user.accessKeys.map((k) => k.accessKey).join(" ")}`
					}
					searchPlaceholder="Search users, emails or keys"
					onRowClick={(user) =>
						navigate({ to: "/access/users/$username", params: { username: user.username } })
					}
					empty={
						<EmptyState
							icon={<Users />}
							title="No users yet"
							description="Create a user to hand out S3 access keys."
							action={canWrite ? <CreateUserDialog /> : undefined}
						/>
					}
					columns={userColumns}
				/>
			</Reveal>
		</>
	);
}
