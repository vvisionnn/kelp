import { QueryClient } from "@tanstack/react-query";
import { createRouter, type RouterHistory } from "@tanstack/react-router";
import { NotFound } from "./components/kelp/not-found.tsx";
import { ApiError } from "./lib/api.ts";
import { routeTree } from "./routeTree.gen.ts";

export interface RouterContext {
	queryClient: QueryClient;
}

export function createQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 10_000,
				// Client errors will not fix themselves; transient server errors might.
				retry: (count, error) =>
					!(error instanceof ApiError && error.status > 0 && error.status < 500) && count < 2,
			},
		},
	});
}

export function createAppRouter(queryClient: QueryClient, history?: RouterHistory) {
	return createRouter({
		routeTree,
		context: { queryClient },
		defaultPreload: "intent",
		defaultNotFoundComponent: NotFound,
		defaultPreloadStaleTime: 0,
		scrollRestoration: true,
		...(history ? { history } : {}),
	});
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof createAppRouter>;
	}
}
