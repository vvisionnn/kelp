import { describe, expect, test } from "bun:test";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { clusterApi } from "../../test/client-fixtures.ts";
import { adminUser, renderApp } from "../../test/render-app.tsx";
import { safeRedirect } from "./login.tsx";

describe("login", () => {
	test("signed-out visitors land on sign-in, then reach the page they asked for", async () => {
		const { routes } = await clusterApi();
		let signedIn = false;
		const app = renderApp("/cluster", {
			...routes,
			"GET /auth/me": () =>
				signedIn ? { user: adminUser } : Response.json({ error: "Sign in to continue" }, { status: 401 }),
			"POST /auth/login": () => {
				signedIn = true;
				return { user: adminUser };
			},
		});
		const username = await screen.findByLabelText("Username");
		expect(app.router.state.location.search).toEqual({ redirect: "/cluster" });
		fireEvent.change(username, { target: { value: "admin" } });
		fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
		fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/cluster"));
		expect(app.api.last("POST", "/auth/login")?.body).toEqual({ username: "admin", password: "pw" });
	});

	test("shows the server's error for wrong credentials", async () => {
		renderApp(
			"/login",
			{
				"POST /auth/login": () => Response.json({ error: "Wrong username or password" }, { status: 401 }),
			},
			null,
		);
		fireEvent.change(await screen.findByLabelText("Username"), { target: { value: "admin" } });
		fireEvent.change(screen.getByLabelText("Password"), { target: { value: "nope" } });
		fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
		expect(await screen.findByText("Wrong username or password")).toBeTruthy();
	});

	test("signed-in users skip the login page", async () => {
		const { routes } = await clusterApi();
		const app = renderApp("/login", routes);
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/"));
	});

	test("only same-app redirects are followed", () => {
		expect(safeRedirect("/buckets/media")).toBe("/buckets/media");
		expect(safeRedirect("//evil.example.com")).toBe("/");
		expect(safeRedirect("https://evil.example.com")).toBe("/");
		expect(safeRedirect(undefined)).toBe("/");
	});
});
