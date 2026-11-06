import { createFileRoute } from "@tanstack/react-router";
import { PolicyForm } from "@/components/kelp/access/policy-form.tsx";
import { PageHeader, Reveal } from "@/components/kelp/page.tsx";

export const Route = createFileRoute("/_app/access/policies/new")({
	staticData: { section: "Access", title: "New policy" },
	component: () => (
		<>
			<PageHeader
				title="Create policy"
				description="Pick a template, point it at a bucket, and adjust. SeaweedFS checks the document as you type."
			/>
			<Reveal>
				<PolicyForm />
			</Reveal>
		</>
	),
});
