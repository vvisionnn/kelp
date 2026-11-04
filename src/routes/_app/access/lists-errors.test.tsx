import { describe, expect, test } from "bun:test";
import { fireEvent, screen } from "@testing-library/react";
import { accessApi } from "../../../../test/access-fixtures.ts";
import { renderApp } from "../../../../test/render-app.tsx";

const PAGES = [
	["/access/users", "GET /iam/users", "bob@example.com"],
	["/access/groups", "GET /iam/groups", "devs"],
	["/access/service-accounts", "GET /iam/service-accounts", "nightly backups"],
	["/access/policies", "GET /iam/policies", "2 users, 1 group"],
] as const;

describe("access lists recover from errors", () => {
	for (const [path, route, ready] of PAGES) {
		test(path, async () => {
			const { routes } = await accessApi();
			let fail = true;
			renderApp(path, {
				...routes,
				[route]: () =>
					fail
						? Response.json({ error: "admin is unreachable", upstream: "admin" }, { status: 502 })
						: routes[route],
			});
			expect(await screen.findByText("SeaweedFS admin reported a problem")).toBeTruthy();
			fail = false;
			fireEvent.click(screen.getByRole("button", { name: "Try again" }));
			expect(await screen.findByText(ready)).toBeTruthy();
		});
	}
});
