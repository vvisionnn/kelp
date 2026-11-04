import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider.tsx";

/** Renders a component that uses router links, without the whole app around it. */
export async function renderInRouter(ui: ReactNode) {
	const rootRoute = createRootRoute({ component: () => <div data-testid="in-router">{ui}</div> });
	const router = createRouter({
		routeTree: rootRoute,
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	const view = render(
		<ThemeProvider>
			<QueryClientProvider client={new QueryClient()}>
				<RouterProvider router={router as never} />
			</QueryClientProvider>
		</ThemeProvider>,
	);
	await screen.findByTestId("in-router");
	return view;
}
