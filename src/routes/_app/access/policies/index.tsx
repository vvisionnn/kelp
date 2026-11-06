import type { IamGroup, IamPolicy } from "@shared/iam.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus, ScrollText } from "lucide-react";
import {
	ALL_BUCKETS,
	accessMatrix,
	actionFrequency,
	policyGrants,
	policyReach,
} from "@/components/kelp/access/analysis.ts";
import { AccessMatrixView } from "@/components/kelp/access/insights.tsx";
import {
	BarsGhost,
	MatrixGhost,
	optional,
	TableGhost,
	TileGhost,
} from "@/components/kelp/access/loading.tsx";
import { policyStats } from "@/components/kelp/access/stats.ts";
import { BarList, dataColor, Kpi } from "@/components/kelp/charts/index.ts";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import { EmptyState, PageHeader, Panel } from "@/components/kelp/page.tsx";
import { LoadingRegion } from "@/components/kelp/skeletons.tsx";
import { allOf, Loaded, Swap } from "@/components/kelp/transitions.tsx";
import { Button } from "@/components/ui/button";
import { accessQueries, describeUsage } from "@/lib/access-queries.ts";
import { formatRelative } from "@/lib/format.ts";
import { objectQueries } from "@/lib/objects-queries.ts";
import { useCanWrite } from "@/lib/session.ts";

export const Route = createFileRoute("/_app/access/policies/")({
	staticData: { section: "Access", title: "Policies" },
	loader: ({ context }) => void context.queryClient.prefetchQuery(accessQueries.policies()),
	component: PoliciesPage,
});

const columns: Array<Column<IamPolicy>> = [
	{
		accessorKey: "name",
		header: "Policy",
		cell: ({ row }) => (
			<span className="flex items-center gap-3">
				<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground [&_svg]:size-3.5">
					<ScrollText />
				</span>
				<span className="font-medium">{row.original.name}</span>
			</span>
		),
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
			<span className="text-[12px] text-muted-foreground">{formatRelative(row.original.updatedAt)}</span>
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

/** What the policies grant, how widely, and which ones nobody uses. */
function PoliciesDashboard({
	policies,
	groups,
	buckets,
}: {
	policies: IamPolicy[];
	groups: IamGroup[];
	buckets: string[];
}) {
	const value = (label: string) => policyStats(policies).find((s) => s.label === label)?.value ?? 0;
	const unused = policies.filter((p) => p.attachedTo.users.length + p.attachedTo.groups.length === 0);
	const actions = actionFrequency(policies);
	const denies = policies.filter((p) => p.document.Statement.some((s) => s.Effect === "Deny")).length;
	const matrix = accessMatrix(
		policies.map((policy) => ({
			username: policy.name,
			email: "",
			actions: [],
			policies: [policy.name],
			groups: [],
			accessKeys: [],
			isStatic: false,
		})),
		[],
		policies,
		buckets,
	);
	const wide = policies.filter((p) => policyGrants(p).allow.some((g) => g.bucket === ALL_BUCKETS)).length;
	return (
		<>
			<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
				<Kpi
					label="Policies"
					value={String(policies.length)}
					hint={`${value("Statements in all")} statements in all`}
				/>
				<Kpi label="Attached" value={String(value("Attached somewhere"))} hint="To a user or a group" />
				<Kpi
					label="Not attached"
					value={String(unused.length)}
					hint={unused.length > 0 ? unused.map((p) => p.name).join(", ") : "Every policy is in use"}
				/>
				<Kpi
					label="All-bucket policies"
					value={String(wide)}
					hint="Grant access to every bucket"
					{...(wide > 0 ? { tone: "warn" as const } : {})}
				/>
				<Kpi label="With a deny" value={String(denies)} hint="Policies that take access away" />
			</div>
			<div className="mt-3 grid items-start gap-3 xl:grid-cols-12">
				<Panel
					title="What each policy grants"
					description="The strongest access per bucket, before it reaches any user"
					className="min-w-0 xl:col-span-8"
				>
					<PolicyMatrix matrix={matrix} />
				</Panel>
				<div className="grid gap-3 xl:col-span-4">
					<Panel title="Users each policy reaches" description="Directly and through groups">
						<BarList
							label="Policies by users reached"
							color={dataColor(3)}
							items={policies
								.map((p) => ({ policy: p.name, users: policyReach(p, groups).length }))
								.sort((a, b) => b.users - a.users)
								.slice(0, 6)
								.map((r) => ({
									key: r.policy,
									label: <span className="font-mono">{r.policy}</span>,
									value: r.users,
									display: String(r.users),
								}))}
						/>
					</Panel>
					<Panel title="Most granted actions" description="How many policies allow each action">
						<BarList
							label="Actions by policies that allow them"
							color={dataColor(0)}
							items={actions.slice(0, 6).map((a) => ({
								key: a.action,
								label: <span className="font-mono">{a.action}</span>,
								value: a.policies,
								display: String(a.policies),
							}))}
						/>
					</Panel>
				</div>
			</div>
		</>
	);
}

/** The access matrix with policy rows that link to each policy. */
function PolicyMatrix({ matrix }: { matrix: ReturnType<typeof accessMatrix> }) {
	return <AccessMatrixView matrix={matrix} rows="policy" />;
}

function PoliciesDashboardGhost() {
	return (
		<>
			<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
				{[0, 1, 2, 3, 4].map((i) => (
					<TileGhost key={i} />
				))}
			</div>
			<div className="mt-3 grid items-start gap-3 xl:grid-cols-12">
				<Panel
					title="What each policy grants"
					description="The strongest access per bucket, before it reaches any user"
					className="min-w-0 xl:col-span-8"
				>
					<MatrixGhost rows={4} />
				</Panel>
				<div className="grid gap-3 xl:col-span-4">
					<Panel title="Users each policy reaches" description="Directly and through groups">
						<BarsGhost rows={4} />
					</Panel>
					<Panel title="Most granted actions" description="How many policies allow each action">
						<BarsGhost rows={4} />
					</Panel>
				</div>
			</div>
		</>
	);
}

function PoliciesSkeleton() {
	return (
		<LoadingRegion label="Loading policies">
			<div className="mb-8">
				<PoliciesDashboardGhost />
			</div>
			<TableGhost columns={["Policy", "Statements", "Used by", "Updated"]} rows={4} />
		</LoadingRegion>
	);
}

function PoliciesPage() {
	const navigate = useNavigate();
	const canWrite = useCanWrite();
	const policies = useQuery(accessQueries.policies());
	const insights = allOf({
		groups: useQuery(accessQueries.groups()),
		buckets: optional(useQuery(objectQueries.buckets()), []),
	});
	return (
		<>
			<PageHeader
				title="Policies"
				description="IAM policy documents you attach to users and groups."
				actions={canWrite && <NewPolicyButton />}
			/>
			<Loaded query={policies} skeleton={<PoliciesSkeleton />}>
				{(list) => (
					<Swap id={list.length > 0 ? "policies" : "empty"}>
						{list.length > 0 && (
							<Loaded query={insights} skeleton={<PoliciesDashboardGhost />} className="mb-8">
								{({ groups, buckets }) => (
									<PoliciesDashboard policies={list} groups={groups} buckets={buckets.map((b) => b.name)} />
								)}
							</Loaded>
						)}
						<DataTable
							data={list}
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
					</Swap>
				)}
			</Loaded>
		</>
	);
}
