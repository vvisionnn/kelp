import type { IamPolicy } from "@shared/iam.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ALL_BUCKETS, policyGrants, policyReach } from "@/components/kelp/access/analysis.ts";
import { ReachGrid } from "@/components/kelp/access/insights.tsx";
import { PolicyForm } from "@/components/kelp/access/policy-form.tsx";
import { Kpi } from "@/components/kelp/charts/index.ts";
import { ErrorState, PageHeader, Panel, SkeletonBlock } from "@/components/kelp/page.tsx";
import { accessQueries, describeUsage } from "@/lib/access-queries.ts";

export const Route = createFileRoute("/_app/access/policies/$name")({
	staticData: { section: "Access", title: "Policies" },
	loader: ({ context, params }) => void context.queryClient.prefetchQuery(accessQueries.policy(params.name)),
	component: PolicyPage,
});

function PolicyPage() {
	const { name } = Route.useParams();
	const { data: policy, isPending, error, refetch } = useQuery(accessQueries.policy(name));
	const groups = useQuery(accessQueries.groups()).data;
	if (isPending)
		return (
			<div role="status" aria-busy="true" aria-label="Loading policy">
				<SkeletonBlock className="mt-2 mb-6 h-8 w-48" />
				<SkeletonBlock className="h-96 rounded-xl" />
			</div>
		);
	if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
	return (
		<>
			<PageHeader title={policy.name} description={`Used by: ${describeUsage(policy)}`} />
			<PolicySummary policy={policy} reach={groups ? policyReach(policy, groups) : null} />
			<PolicyForm key={policy.updatedAt ?? policy.name} policy={policy} />
		</>
	);
}

/** What the policy does, before the document: its reach, the buckets it touches and how. */
function PolicySummary({ policy, reach }: { policy: IamPolicy; reach: string[] | null }) {
	const { allow, deny } = policyGrants(policy);
	const all = allow.find((g) => g.bucket === ALL_BUCKETS);
	return (
		<div className="mb-8 grid items-start gap-3 lg:grid-cols-12 [&>*]:min-w-0">
			<div className="grid grid-cols-2 gap-3 lg:col-span-4">
				<Kpi
					label="Users reached"
					value={reach === null ? "–" : String(reach.length)}
					hint={`${policy.attachedTo.users.length} direct, ${policy.attachedTo.groups.length} ${policy.attachedTo.groups.length === 1 ? "group" : "groups"}`}
				/>
				<Kpi
					label="Buckets"
					value={all ? "All" : String(allow.length)}
					hint={deny.length > 0 ? `${deny.length} with a deny` : "No denies"}
					{...(all ? { tone: "warn" as const } : {})}
				/>
				<Kpi label="Statements" value={String(policy.statementCount)} />
				<Kpi
					label="Actions"
					value={String(new Set(policy.document.Statement.flatMap((s) => [s.Action].flat())).size)}
				/>
			</div>
			<Panel title="What it grants" className="min-w-0 lg:col-span-8">
				<ReachGrid grants={allow} empty="The document allows nothing Kelp recognizes on S3 buckets." />
				{deny.length > 0 && (
					<p className="mt-3 text-[12px] text-muted-foreground">
						Denies {deny.map((d) => (d.bucket === ALL_BUCKETS ? "all buckets" : d.bucket)).join(", ")}.
					</p>
				)}
			</Panel>
		</div>
	);
}
