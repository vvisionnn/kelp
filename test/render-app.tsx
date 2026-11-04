import type { SessionUser } from "@shared/api.ts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { ThemeProvider } from "@/components/theme-provider.tsx";
import { createAppRouter } from "@/router.tsx";

export interface ApiCall {
	method: string;
	path: string;
	query: URLSearchParams;
	body: unknown;
}

type Responder = unknown | ((call: ApiCall) => unknown | Response | Promise<unknown | Response>);

/** Answers `/api` requests from a `"METHOD /path"` table and records every call. */
export function mockApi(routes: Record<string, Responder>) {
	const calls: ApiCall[] = [];
	const original = globalThis.fetch;
	globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
		const url = new URL(String(input), "http://localhost");
		const method = init?.method ?? "GET";
		const path = url.pathname.replace(/^\/api/, "");
		const call: ApiCall = {
			method,
			path,
			query: url.searchParams,
			body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
		};
		calls.push(call);
		const responder = routes[`${method} ${path}`];
		if (responder === undefined) {
			return Response.json({ error: `unmocked ${method} ${path}` }, { status: 404 });
		}
		const result =
			typeof responder === "function" ? await (responder as (c: ApiCall) => unknown)(call) : responder;
		return result instanceof Response ? result : Response.json(result ?? null);
	}) as typeof fetch;
	return {
		calls,
		restore: () => {
			globalThis.fetch = original;
		},
		last: (method: string, path: string) => calls.findLast((c) => c.method === method && c.path === path),
	};
}

export const adminUser: SessionUser = { name: "admin", role: "admin" };
export const viewerUser: SessionUser = { name: "viewer", role: "viewer" };

/** Renders the whole app at `path` with a mocked API and the given session. */
export function renderApp(
	path: string,
	routes: Record<string, Responder> = {},
	user: SessionUser | null = adminUser,
) {
	let current = user;
	const api = mockApi({
		"GET /auth/me": () =>
			current ? { user: current } : Response.json({ error: "Sign in to continue" }, { status: 401 }),
		"POST /auth/logout": () => {
			current = null;
			return { ok: true };
		},
		...routes,
	});
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false, refetchInterval: false } },
	});
	const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [path] }));
	const view = render(
		<ThemeProvider>
			<QueryClientProvider client={queryClient}>
				<RouterProvider router={router} />
			</QueryClientProvider>
		</ThemeProvider>,
	);
	return {
		...view,
		api,
		router,
		queryClient,
		/** Ends the mocked session, as if the cookie expired. */
		expireSession: () => {
			current = null;
		},
	};
}

export async function fixture<T = unknown>(name: string): Promise<T> {
	return Bun.file(`${import.meta.dir}/../fixtures/${name}.json`).json() as Promise<T>;
}
