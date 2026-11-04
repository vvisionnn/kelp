import type { IamPolicy } from "@shared/iam.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus, ScrollText } from "lucide-react";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import { EmptyState, PageHeader, Reveal } from "@/components/kelp/page.tsx";
import { Button } from "@/components/ui/button";
import { accessQueries, describeUsage } from "@/lib/access-queries.ts";
import { formatRelative } from "@/lib/format.ts";
import { useCanWrite } from "@/lib/session.ts";

export const Route = createFileRoute("/_app/access/policies/")({
	staticData: { section: "Access", title: "Policies" },
	loader: ({ context }) => context.queryClient.prefetchQuery(accessQueries.policies()),
	component: PoliciesPage,
});

const columns: Array<Column<IamPolicy>> = [
	{
		accessorKey: "name",
		header: "Policy",
		cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
	},
	{
		accessorKey: "statementCount",
		header: "Statements",
		cell: ({ row }) => <span className="tabular">{row.original.statementCount}</span>,
	},
	{
		id: "usage",
		accessorFn: (p) => p.attachedTo.users.length + p.attachedTo.groups.length,
		header: "Used by",
		cell: ({ row }) => {
			const usage = describeUsage(row.original);
			return <span className={usage === "Unused" ? "text-muted-foreground" : ""}>{usage}</span>;
		},
	},
	{
		accessorKey: "updatedAt",
		header: "Updated",
		cell: ({ row }) => (
			<span className="text-muted-foreground text-xs">{formatRelative(row.original.updatedAt)}</span>
		),
	},
];

function NewPolicyButton() {
	return (
		<Button render={<Link to="/access/policies/new" />}>
			<Plus />
			Create policy
		</Button>
	);
}

function PoliciesPage() {
	const navigate = useNavigate();
	const canWrite = useCanWrite();
	const { data, isPending, error, refetch } = useQuery(accessQueries.policies());
	return (
		<>
			<PageHeader
				title="Policies"
				description="IAM policy documents you attach to users and groups."
				actions={canWrite && <NewPolicyButton />}
			/>
			<Reveal>
				<DataTable
					data={data}
					isLoading={isPending}
					error={error}
					onRetry={() => refetch()}
					getRowId={(p) => p.name}
					searchText={(p) => `${p.name} ${p.attachedTo.users.join(" ")} ${p.attachedTo.groups.join(" ")}`}
					searchPlaceholder="Search policies"
					onRowClick={(p) => navigate({ to: "/access/policies/$name", params: { name: p.name } })}
					empty={
						<EmptyState
							icon={<ScrollText />}
							title="No policies yet"
							description="Start from a template: read-only bucket, read and write, or full access."
							{...(canWrite ? { action: <NewPolicyButton /> } : {})}
						/>
					}
					columns={columns}
				/>
			</Reveal>
		</>
	);
}
