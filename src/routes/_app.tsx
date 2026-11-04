import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/kelp/app-shell.tsx";
import { sessionQuery } from "@/lib/session.ts";

export const Route = createFileRoute("/_app")({
	beforeLoad: async ({ context, location }) => {
		const user = await context.queryClient.ensureQueryData(sessionQuery).catch(() => undefined);
		if (!user) throw redirect({ to: "/login", search: { redirect: location.href } });
		return { user };
	},
	component: AppShell,
});
