import { describe, expect, test } from "bun:test";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { UNAUTHORIZED_EVENT } from "@/lib/api.ts";
import { clusterApi } from "../../../test/client-fixtures.ts";
import { maintenanceApi } from "../../../test/maintenance-fixtures.ts";
import { renderApp, viewerUser } from "../../../test/render-app.tsx";
import { isActivePath } from "./app-shell.tsx";

describe("app shell", () => {
	test("the page wears its area's hue and the area's pages show as pills", async () => {
		const { routes } = await clusterApi();
		const { container } = renderApp("/volumes", routes);
		const pages = await screen.findByRole("navigation", { name: "Storage" });
		const active = within(pages)
			.getAllByRole("link")
			.filter((l) => l.hasAttribute("data-active"));
		expect(active.map((l) => l.textContent)).toEqual(["Volumes"]);
		expect(container.querySelector("[data-area]")?.getAttribute("data-area")).toBe("storage");
		expect(screen.queryByRole("navigation", { name: "breadcrumb" })).toBeNull();
	});

	test("the overview has no page pills and uses the neutral spectrum", async () => {
		const { routes } = await clusterApi();
		const { container } = renderApp("/", routes);
		await screen.findByText("Disk capacity");
		expect(container.querySelector("[data-area]")?.getAttribute("data-area")).toBe("home");
		expect(screen.queryByRole("navigation", { name: "Overview" })).toBeNull();
	});

	test("detail pages name the item in the breadcrumb, not the raw URL segment", async () => {
		const { routes, vacuumConfig } = await maintenanceApi();
		renderApp("/maintenance/vacuum", routes);
		const crumbs = await screen.findByRole("navigation", { name: "breadcrumb" });
		expect(await within(crumbs).findByText(vacuumConfig.displayName)).toBeTruthy();
		expect(within(crumbs).queryByText("vacuum")).toBeNull();
	});

	test("theme switch flips between light and dark", async () => {
		const { routes } = await clusterApi();
		renderApp("/", routes);
		fireEvent.click(await screen.findByRole("button", { name: "Switch to dark theme" }));
		expect(document.documentElement.classList.contains("dark")).toBe(true);
		fireEvent.click(screen.getByRole("button", { name: "Switch to light theme" }));
		expect(document.documentElement.classList.contains("dark")).toBe(false);
	});

	test("account menu shows the role and changes theme", async () => {
		const { routes } = await clusterApi();
		renderApp("/", routes, viewerUser);
		expect(await screen.findByText("Read-only")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
		expect(within(await screen.findByRole("menu")).getByText("Read-only")).toBeTruthy();
		fireEvent.click(await screen.findByRole("menuitemradio", { name: "Dark" }));
		expect(localStorage.getItem("kelp-theme")).toBe("dark");
	});

	test("account menu signs out", async () => {
		const { routes } = await clusterApi();
		const app = renderApp("/", routes);
		fireEvent.click(await screen.findByRole("button", { name: "Account menu" }));
		expect(await screen.findByText("Administrator")).toBeTruthy();
		fireEvent.click(await screen.findByRole("menuitem", { name: "Sign out" }));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/login"));
		expect(app.api.last("POST", "/auth/logout")).toBeTruthy();
	});

	test("an expired session sends the user to sign in and back", async () => {
		const { routes } = await clusterApi();
		const app = renderApp("/cluster", routes);
		await screen.findByText("Leader");
		app.expireSession();
		await act(async () => {
			window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
		});
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/login"));
		expect(app.router.state.location.search).toEqual({ redirect: "/cluster" });
	});

	test("command menu opens with ⌘K and navigates", async () => {
		const { routes } = await clusterApi();
		const app = renderApp("/", routes);
		await screen.findByText("Disk capacity");
		fireEvent.keyDown(window, { key: "k", metaKey: true });
		const dialog = await screen.findByRole("dialog");
		fireEvent.click(within(dialog).getByText("Nodes"));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/cluster"));
	});

	test("command menu runs theme and sign-out actions", async () => {
		const { routes } = await clusterApi();
		const app = renderApp("/", { ...routes });
		fireEvent.click(await screen.findByRole("button", { name: /Search/ }));
		fireEvent.click(within(await screen.findByRole("dialog")).getByText("Use dark theme"));
		expect(localStorage.getItem("kelp-theme")).toBe("dark");
		fireEvent.keyDown(window, { key: "K", ctrlKey: true });
		fireEvent.click(within(await screen.findByRole("dialog")).getByText("Use light theme"));
		expect(localStorage.getItem("kelp-theme")).toBe("light");
		fireEvent.keyDown(window, { key: "k", ctrlKey: true });
		fireEvent.click(within(await screen.findByRole("dialog")).getByText("Match system theme"));
		expect(localStorage.getItem("kelp-theme")).toBe("system");
		fireEvent.keyDown(window, { key: "k", metaKey: true });
		fireEvent.click(within(await screen.findByRole("dialog")).getByText("Sign out"));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/login"));
	});

	test("isActivePath matches sections but the overview only matches itself", () => {
		expect(isActivePath("/", "/")).toBe(true);
		expect(isActivePath("/cluster", "/")).toBe(false);
		expect(isActivePath("/buckets/media", "/buckets")).toBe(true);
		expect(isActivePath("/bucketsx", "/buckets")).toBe(false);
	});
});
