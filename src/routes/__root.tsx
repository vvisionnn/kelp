import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { RouterContext } from "../router.tsx";

export const Route = createRootRouteWithContext<RouterContext>()({
	component: () => (
		<TooltipProvider delay={300}>
			<Outlet />
			<Toaster position="bottom-right" />
		</TooltipProvider>
	),
});
