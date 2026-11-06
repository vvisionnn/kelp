import type { IamUser } from "@shared/iam.ts";
import { NameList, StaticBadge } from "@/components/kelp/access/badges.tsx";
import { Avatar } from "@/components/kelp/access/identity.tsx";
import type { Column } from "@/components/kelp/data-table.tsx";
import { describeActions } from "@/lib/access-queries.ts";

export const userColumns: Array<Column<IamUser>> = [
	{
		accessorKey: "username",
		header: "User",
		cell: ({ row }) => (
			<div className="flex min-w-0 items-center gap-3">
				<Avatar name={row.original.username} size="md" />
				<div className="min-w-0">
					<p className="flex items-center gap-2 font-medium">
						<span className="truncate">{row.original.username}</span>
						{row.original.isStatic && <StaticBadge />}
					</p>
					<p className="truncate text-[12px] text-muted-foreground">{row.original.email || "No email"}</p>
				</div>
			</div>
		),
		size: 280,
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
					{inactive > 0 && <span className="text-[12px] text-muted-foreground"> ({inactive} inactive)</span>}
				</span>
			);
		},
	},
	{
		id: "permissions",
		accessorFn: (user) => describeActions(user.actions),
		header: "Permissions",
		cell: ({ row }) => <span>{describeActions(row.original.actions)}</span>,
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
