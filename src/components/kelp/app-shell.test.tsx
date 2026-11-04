import { describe, expect, test } from "bun:test";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { UNAUTHORIZED_EVENT } from "@/lib/api.ts";
import { clusterApi } from "../../../test/client-fixtures.ts";
import { maintenanceApi } from "../../../test/maintenance-fixtures.ts";
import { renderApp, viewerUser } from "../../../test/render-app.tsx";
import { isActivePath } from "./app-shell.tsx";

/** The page toolbar (the sticky header above the content). */
function toolbar(): HTMLElement {
	return document.querySelector("header[data-toolbar]") as HTMLElement;
}

describe("app shell", () => {
	test("the sidebar marks the current page, including from its detail pages", async () => {
		const { routes } = await clusterApi();
		renderApp("/cluster", routes);
		await screen.findByText("Leader");
		const pages = screen.getByRole("navigation", { name: "Pages" });
		const active = within(pages)
			.getAllByRole("link")
			.filter((l) => l.hasAttribute("data-active"));
		expect(active.map((l) => l.textContent)).toEqual(["Nodes"]);
		expect(within(pages).getByText("Storage")).toBeTruthy();
	});

	test("detail pages lead back to their list and name the item, not the raw URL segment", async () => {
		const { routes, vacuumConfig } = await maintenanceApi();
		renderApp("/maintenance/vacuum", routes);
		await screen.findAllByText(vacuumConfig.displayName);
		const banner = toolbar();
		const back = await within(banner).findByRole("link", { name: "Maintenance" });
		expect(back.getAttribute("href")).toBe("/maintenance");
		expect(await within(banner).findByText(vacuumConfig.displayName)).toBeTruthy();
		expect(within(banner).queryByText("vacuum")).toBeNull();
	});

	test("the toolbar title appears once the page header scrolls away", async () => {
		const { routes } = await clusterApi();
		renderApp("/", routes);
		await screen.findByText("Disk capacity");
		const title = within(toolbar()).getByText("Overview");
		expect(title.getAttribute("aria-hidden")).toBe("true");
		await act(async () => {
			Object.defineProperty(window, "scrollY", { configurable: true, value: 200 });
			window.dispatchEvent(new Event("scroll"));
		});
		expect(title.getAttribute("aria-hidden")).toBe("false");
		Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
	});

	test("on narrow screens the sidebar opens as a sheet and closes after navigating", async () => {
		const { routes } = await clusterApi();
		const app = renderApp("/", routes);
		await screen.findByText("Disk capacity");
		fireEvent.click(screen.getByRole("button", { name: "Show sidebar" }));
		const sheet = await screen.findByRole("dialog");
		fireEvent.click(within(sheet).getByRole("link", { name: "Nodes" }));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/cluster"));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	});

	test("the sidebar shows cluster health", async () => {
		const { routes } = await clusterApi();
		renderApp("/cluster", routes);
		const pages = await screen.findByRole("navigation", { name: "Pages" });
		const sidebar = pages.parentElement as HTMLElement;
		expect(await within(sidebar).findByText(/^Healthy, SeaweedFS/)).toBeTruthy();
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
