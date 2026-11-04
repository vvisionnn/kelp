import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PolicyForm } from "@/components/kelp/access/policy-form.tsx";
import { ErrorState, PageHeader, SkeletonBlock } from "@/components/kelp/page.tsx";
import { accessQueries, describeUsage } from "@/lib/access-queries.ts";

export const Route = createFileRoute("/_app/access/policies/$name")({
	staticData: { section: "Access", title: "Policies" },
	loader: ({ context, params }) => context.queryClient.prefetchQuery(accessQueries.policy(params.name)),
	component: PolicyPage,
});

function PolicyPage() {
	const { name } = Route.useParams();
	const { data: policy, isPending, error, refetch } = useQuery(accessQueries.policy(name));
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
			<PolicyForm key={policy.updatedAt ?? policy.name} policy={policy} />
		</>
	);
}
