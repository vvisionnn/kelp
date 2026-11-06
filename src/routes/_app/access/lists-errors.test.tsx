import { describe, expect, test } from "bun:test";
import { fireEvent, screen } from "@testing-library/react";
import { accessQueries } from "@/lib/access-queries.ts";
import { accessApi } from "../../../../test/access-fixtures.ts";
import { setMedia } from "../../../../test/media.ts";
import { renderApp } from "../../../../test/render-app.tsx";
import { settle } from "../../../../test/settle.ts";

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
			expect((await screen.findAllByText(ready)).length).toBeGreaterThan(0);
		});
	}
});

const LOADING = [
	["/access/users", "Loading users", "Users"],
	["/access/groups", "Loading groups", "Groups"],
	["/access/service-accounts", "Loading service accounts", "Service accounts"],
	["/access/policies", "Loading policies", "Policies"],
	["/access/users/bob", "Loading user", "bob"],
	["/access/groups/devs", "Loading group", "devs"],
	["/access/policies/ro", "Loading policy", "ro"],
] as const;

describe("access pages while loading", () => {
	for (const [path, label, title] of LOADING) {
		test(`${path} keeps its header above a named skeleton`, async () => {
			const { routes } = await accessApi();
			const held = Object.fromEntries(
				Object.keys(routes).map((route) => [route, () => new Promise(() => {})]),
			);
			renderApp(path, held);
			expect(await screen.findByRole("status", { name: label })).toBeTruthy();
			expect(screen.getByRole("heading", { level: 1, name: title })).toBeTruthy();
			expect(screen.queryByText("No users yet")).toBeNull();
			expect(screen.queryByText("None.")).toBeNull();
		});
	}

	test("the users table does not wait for the dashboard's queries", async () => {
		const { routes } = await accessApi();
		renderApp("/access/users", { ...routes, "GET /iam/groups": () => new Promise(() => {}) });
		expect(await screen.findByText("bob@example.com")).toBeTruthy();
		expect(screen.getByText("Who can reach what")).toBeTruthy();
		expect(screen.queryByRole("table", { name: "Access by user and bucket" })).toBeNull();
	});

	test("a failed dashboard query is reported, and the table stays", async () => {
		const { routes } = await accessApi();
		renderApp("/access/users", {
			...routes,
			"GET /iam/policies": () => Response.json({ error: "admin is unreachable" }, { status: 502 }),
		});
		expect(await screen.findByText("admin is unreachable")).toBeTruthy();
		expect(screen.getByText("bob@example.com")).toBeTruthy();
	});

	test("a failed background refresh keeps the data on screen", async () => {
		const { routes } = await accessApi();
		let fail = false;
		const app = renderApp("/access/users", {
			...routes,
			"GET /iam/users": () =>
				fail ? Response.json({ error: "admin is unreachable" }, { status: 502 }) : routes["GET /iam/users"],
		});
		await screen.findByText("bob@example.com");
		fail = true;
		await app.queryClient.refetchQueries({ queryKey: accessQueries.users().queryKey });
		await settle();
		expect(screen.getByText("bob@example.com")).toBeTruthy();
		expect(screen.queryByText("admin is unreachable")).toBeNull();
	});

	test("a user whose groups failed says so instead of showing no reach", async () => {
		const { routes } = await accessApi();
		const app = renderApp("/access/users/bob", {
			...routes,
			"GET /iam/groups": () => Response.json({ error: "admin is unreachable" }, { status: 502 }),
		});
		expect(await screen.findByText("Access keys")).toBeTruthy();
		expect(await screen.findByText("admin is unreachable")).toBeTruthy();
		expect(screen.queryByRole("region", { name: "Buckets reached" })).toBeNull();
		// The failure must not bounce the page back to its skeleton and retry forever.
		await settle(200);
		expect(app.api.calls.filter((call) => call.path === "/iam/groups").length).toBeLessThan(4);
	});

	test("full motion renders the same pages", async () => {
		setMedia("(prefers-reduced-motion: reduce)", false);
		const { routes } = await accessApi();
		renderApp("/access/users/bob", routes);
		expect((await screen.findAllByText("2 access keys")).length).toBeGreaterThan(0);
		expect(await screen.findByRole("region", { name: "Buckets reached" })).toBeTruthy();
	});
});
