import type { IamPolicy } from "@shared/iam.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ALL_BUCKETS, policyGrants, policyReach } from "@/components/kelp/access/analysis.ts";
import { ReachGrid } from "@/components/kelp/access/insights.tsx";
import {
	EditorGhost,
	optional,
	ReachGhost,
	SheetRowsGhost,
	TextGhost,
	TileGhost,
	useLanding,
} from "@/components/kelp/access/loading.tsx";
import { PolicyForm } from "@/components/kelp/access/policy-form.tsx";
import { Kpi } from "@/components/kelp/charts/index.ts";
import { PageHeader, Panel, Section, SkeletonBlock } from "@/components/kelp/page.tsx";
import { LoadingRegion } from "@/components/kelp/skeletons.tsx";
import { TextMorph } from "@/components/kelp/text-morph.tsx";
import { Loaded } from "@/components/kelp/transitions.tsx";
import { accessQueries, describeUsage } from "@/lib/access-queries.ts";

export const Route = createFileRoute("/_app/access/policies/$name")({
	staticData: { section: "Access", title: "Policies" },
	// The page's secondary queries start here too, so they land with the policy and not after it.
	loader: ({ context: { queryClient }, params }) => {
		void queryClient.prefetchQuery(accessQueries.policy(params.name));
		void queryClient.prefetchQuery(accessQueries.groups());
		void queryClient.prefetchQuery(accessQueries.principals());
	},
	component: PolicyPage,
});

function PolicyPage() {
	const { name } = Route.useParams();
	const policy = useQuery(accessQueries.policy(name));
	const groups = useQuery(accessQueries.groups());
	const principals = useQuery(accessQueries.principals());
	const landed = useLanding(policy, groups, principals);
	return (
		<>
			<PageHeader
				title={name}
				description={
					policy.data ? (
						<TextMorph>{`Used by: ${describeUsage(policy.data)}`}</TextMorph>
					) : (
						!policy.error && <SkeletonBlock className="my-0.5 h-3.5 w-40" />
					)
				}
			/>
			<Loaded query={landed} skeleton={<PolicySkeleton />}>
				{(data) => (
					<>
						<PolicySummary policy={data} />
						<PolicyForm policy={data} />
					</>
				)}
			</Loaded>
		</>
	);
}

function PolicySkeleton() {
	return (
		<LoadingRegion label="Loading policy">
			<div className="mb-8 grid items-start gap-3 lg:grid-cols-12 [&>*]:min-w-0">
				<div className="grid grid-cols-2 gap-3 lg:col-span-4">
					<TileGhost />
					<TileGhost />
					<TileGhost hint={false} />
					<TileGhost hint={false} />
				</div>
				<Panel title="What it grants" className="min-w-0 lg:col-span-8">
					<ReachGhost />
				</Panel>
			</div>
			<div className="grid grid-cols-[minmax(0,1fr)] items-start gap-x-6 gap-y-8 lg:grid-cols-12">
				<div className="min-w-0 lg:col-span-8">
					<EditorGhost />
				</div>
				<div className="grid min-w-0 gap-8 lg:col-span-4">
					<Section title="Used by" description={<TextGhost className="w-72" />} className="mt-0 min-w-0">
						<SheetRowsGhost />
					</Section>
					<Section
						title="Principals"
						description="Reference these in a Principal element."
						className="mt-0 min-w-0"
					>
						<SheetRowsGhost rows={6} />
					</Section>
				</div>
			</div>
		</LoadingRegion>
	);
}

/** What the policy does, before the document: its reach, the buckets it touches and how. */
function PolicySummary({ policy }: { policy: IamPolicy }) {
	const groups = useQuery(accessQueries.groups());
	const reach = optional(
		{ data: groups.data && policyReach(policy, groups.data), error: groups.error },
		null,
	);
	const { allow, deny } = policyGrants(policy);
	const all = allow.find((g) => g.bucket === ALL_BUCKETS);
	return (
		<div className="mb-8 grid items-start gap-3 lg:grid-cols-12 [&>*]:min-w-0">
			<div className="grid grid-cols-2 gap-3 lg:col-span-4">
				<Loaded query={reach} skeleton={<TileGhost />}>
					{(users) => (
						<Kpi
							label="Users reached"
							value={users === null ? "–" : String(users.length)}
							hint={`${policy.attachedTo.users.length} direct, ${policy.attachedTo.groups.length} ${policy.attachedTo.groups.length === 1 ? "group" : "groups"}`}
							className="h-full"
						/>
					)}
				</Loaded>
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
