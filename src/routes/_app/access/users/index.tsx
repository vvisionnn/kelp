import type { IamGroup, IamPolicy, IamUser, ServiceAccount } from "@shared/iam.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Users } from "lucide-react";
import {
	type AccessKind,
	accessKind,
	accessMatrix,
	attentionItems,
	keyAges,
	policyReach,
	ROTATE_AFTER_DAYS,
} from "@/components/kelp/access/analysis.ts";
import { CreateUserDialog } from "@/components/kelp/access/create-user-dialog.tsx";
import { AccessMatrixView, AttentionList, ExposureBars } from "@/components/kelp/access/insights.tsx";
import {
	BarsGhost,
	ColumnsGhost,
	Expand,
	MatrixGhost,
	optional,
	SmallRingGhost,
	TableGhost,
	TileGhost,
} from "@/components/kelp/access/loading.tsx";
import { userStats } from "@/components/kelp/access/stats.ts";
import { userColumns } from "@/components/kelp/access/user-columns.tsx";
import { BarList, Columns, dataColor, Kpi, Ring } from "@/components/kelp/charts/index.ts";
import { DataTable } from "@/components/kelp/data-table.tsx";
import { EmptyState, PageHeader, Panel } from "@/components/kelp/page.tsx";
import { LoadingRegion } from "@/components/kelp/skeletons.tsx";
import { RollingValue, TextMorph } from "@/components/kelp/text-morph.tsx";
import { allOf, Loaded, Swap } from "@/components/kelp/transitions.tsx";
import { accessQueries } from "@/lib/access-queries.ts";
import { plural } from "@/lib/format.ts";
import { objectQueries } from "@/lib/objects-queries.ts";
import { useCanWrite } from "@/lib/session.ts";

export const Route = createFileRoute("/_app/access/users/")({
	staticData: { section: "Access", title: "Users" },
	loader: ({ context }) => void context.queryClient.prefetchQuery(accessQueries.users()),
	component: UsersPage,
});

const KIND_SLICES: Array<{ kind: AccessKind; label: string; color: string }> = [
	{ kind: "admin", label: "Full control", color: dataColor(1) },
	{ kind: "policies", label: "Policies and groups", color: dataColor(0) },
	{ kind: "actions", label: "Built-in actions", color: dataColor(2) },
	{ kind: "none", label: "No access", color: "var(--accent)" },
];

function UsersPage() {
	const navigate = useNavigate();
	const canWrite = useCanWrite();
	const users = useQuery(accessQueries.users());
	const insights = allOf({
		groups: useQuery(accessQueries.groups()),
		policies: useQuery(accessQueries.policies()),
		buckets: optional(useQuery(objectQueries.buckets()), []),
		accounts: optional(useQuery(accessQueries.serviceAccounts()), []),
	});
	return (
		<>
			<PageHeader
				title="Users"
				description="People and apps that sign S3 requests with access keys, and what each of them can reach."
				actions={canWrite && <CreateUserDialog />}
			/>
			<Loaded query={users} skeleton={<UsersSkeleton />}>
				{(list) => (
					<Swap id={list.length > 0 ? "users" : "empty"}>
						{list.length > 0 && (
							<Loaded query={insights} skeleton={<UsersDashboardGhost />} className="mb-8">
								{({ groups, policies, buckets, accounts }) => (
									<UsersDashboard
										users={list}
										groups={groups}
										policies={policies}
										buckets={buckets.map((b) => b.name)}
										accounts={accounts}
									/>
								)}
							</Loaded>
						)}
						<DataTable
							data={list}
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
					</Swap>
				)}
			</Loaded>
		</>
	);
}

function UsersDashboardGhost() {
	return (
		<>
			<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
				{[0, 1, 2, 3, 4, 5].map((i) => (
					<TileGhost key={i} />
				))}
			</div>
			<div className="mt-3 grid items-start gap-3 xl:grid-cols-12">
				<Panel
					title="Who can reach what"
					description="The strongest access each user has to each bucket, from actions, policies and groups"
					className="min-w-0 xl:col-span-8"
				>
					<MatrixGhost rows={6} />
				</Panel>
				<div className="grid min-w-0 gap-3 xl:col-span-4">
					<Panel title="How users get access">
						<SmallRingGhost className="size-[132px]" />
					</Panel>
				</div>
			</div>
			<div className="mt-3 grid gap-3 lg:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
				<Panel title="Who can change each bucket" description="Users by their strongest access">
					<BarsGhost rows={6} legend />
				</Panel>
				<Panel title="Access keys by age" description={`Rotate keys older than ${ROTATE_AFTER_DAYS} days`}>
					<ColumnsGhost height={170} />
				</Panel>
				<Panel title="Users each policy reaches" description="Directly and through groups">
					<BarsGhost rows={4} />
				</Panel>
			</div>
		</>
	);
}

function UsersSkeleton() {
	return (
		<LoadingRegion label="Loading users">
			<div className="mb-8">
				<UsersDashboardGhost />
			</div>
			<TableGhost columns={["User", "Access keys", "Permissions", "Policies", "Groups"]} twoLine />
		</LoadingRegion>
	);
}

function UsersDashboard({
	users,
	groups,
	policies,
	buckets,
	accounts,
}: {
	users: IamUser[];
	groups: IamGroup[];
	policies: IamPolicy[];
	buckets: string[];
	accounts: ServiceAccount[];
}) {
	const stats = userStats(users, groups, policies);
	const kinds = users.map((user) => accessKind(user, groups, policies));
	const attention = attentionItems(users, groups, policies);
	const expiring = accounts.filter((a) => {
		const age = a.expiresAt ? (Date.parse(a.expiresAt) - Date.now()) / 86_400_000 : null;
		return age !== null && age >= 0 && age <= 30;
	}).length;
	const matrix = accessMatrix(users, groups, policies, buckets);
	const reach = policies
		.map((policy) => ({ policy: policy.name, users: policyReach(policy, groups).length }))
		.sort((a, b) => b.users - a.users);
	return (
		<>
			<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
				<Kpi
					label="Users"
					value={String(stats.users)}
					hint={`${plural(groups.length, "group")}, ${plural(policies.length, "policy", "policies")}`}
				/>
				<Kpi
					label="Keys that can sign"
					value={String(stats.active)}
					hint={stats.paused > 0 ? `${stats.paused} paused` : "None paused"}
				/>
				<Kpi
					label="Keys to rotate"
					value={String(stats.rotate)}
					hint={stats.oldest === null ? "No key ages known" : `Oldest is ${stats.oldest} days`}
					{...(stats.rotate > 0 ? { tone: "warn" as const } : {})}
				/>
				<Kpi
					label="Full control"
					value={String(stats.admins)}
					hint={stats.admins === 1 ? "1 user can do anything" : `${stats.admins} users can do anything`}
					{...(stats.admins > 2 ? { tone: "warn" as const } : {})}
				/>
				<Kpi
					label="Reach nothing"
					value={String(stats.reachNothing)}
					hint="No bucket access"
					{...(stats.reachNothing > 0 ? { tone: "warn" as const } : {})}
				/>
				<Kpi
					label="Service accounts"
					value={String(accounts.length)}
					hint={expiring > 0 ? `${expiring} expire within 30 days` : "None expire this month"}
				/>
			</div>

			<div className="mt-3 grid items-start gap-3 xl:grid-cols-12">
				<Panel
					title="Who can reach what"
					description="The strongest access each user has to each bucket, from actions, policies and groups"
					className="min-w-0 xl:col-span-8"
				>
					<AccessMatrixView matrix={matrix} />
				</Panel>
				<div className="grid min-w-0 gap-3 xl:col-span-4">
					<Panel title="How users get access">
						<Ring
							label="Users by how they get access"
							size={132}
							thickness={14}
							slices={KIND_SLICES.map((slice) => {
								const count = kinds.filter((kind) => kind === slice.kind).length;
								return { label: slice.label, value: count, color: slice.color, display: String(count) };
							})}
							center={
								<>
									<span className="font-rounded font-semibold text-[22px] leading-7">
										<RollingValue text={String(users.length)} />
									</span>
									<span className="text-[12px] text-muted-foreground">users</span>
								</>
							}
						/>
					</Panel>
					<Expand open={attention.length > 0}>
						<Panel
							title="Needs attention"
							description={
								<TextMorph>{`${attention.length} ${attention.length === 1 ? "item" : "items"}`}</TextMorph>
							}
						>
							<AttentionList items={attention} />
						</Panel>
					</Expand>
				</div>
			</div>

			<div className="mt-3 grid gap-3 lg:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
				<Panel title="Who can change each bucket" description="Users by their strongest access">
					<ExposureBars matrix={matrix} />
				</Panel>
				<Panel title="Access keys by age" description={`Rotate keys older than ${ROTATE_AFTER_DAYS} days`}>
					<Columns
						label="Access keys by age"
						height={170}
						columns={keyAges(users.flatMap((u) => u.accessKeys))}
						color={dataColor(0)}
					/>
				</Panel>
				<Panel title="Users each policy reaches" description="Directly and through groups">
					<BarList
						label="Policies by users reached"
						color={dataColor(3)}
						empty="No policies yet."
						items={reach.slice(0, 7).map((r) => ({
							key: r.policy,
							label: (
								<Link
									to="/access/policies/$name"
									params={{ name: r.policy }}
									className="font-mono hover:underline"
								>
									{r.policy}
								</Link>
							),
							value: r.users,
							display: `${r.users} ${r.users === 1 ? "user" : "users"}`,
						}))}
					/>
				</Panel>
			</div>
		</>
	);
}
