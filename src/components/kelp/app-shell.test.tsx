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

	test("hovering the sidebar slides a pill under the link, never under the current page", async () => {
		const { routes } = await clusterApi();
		renderApp("/cluster", routes);
		await screen.findByText("Leader");
		const pages = screen.getByRole("navigation", { name: "Pages" });
		const overview = within(pages).getByRole("link", { name: "Overview" });
		fireEvent.pointerEnter(overview);
		await waitFor(() => expect(overview.querySelector(".bg-accent\\/60")).toBeTruthy());
		expect(overview.querySelector(".bg-accent\\/60")?.parentElement?.classList.contains("opacity-0")).toBe(
			false,
		);
		// On the current page the tint is there but invisible, so on arrival it fades under the pill.
		const current = within(pages).getByRole("link", { name: "Nodes" });
		fireEvent.pointerEnter(current);
		await waitFor(() => expect(current.querySelector(".bg-accent\\/60")).toBeTruthy());
		expect(current.querySelector(".bg-accent\\/60")?.parentElement?.classList.contains("opacity-0")).toBe(
			true,
		);
		fireEvent.pointerLeave(pages);
		await waitFor(() => expect(current.querySelector(".bg-accent\\/60")).toBeNull());
	});

	test("the sidebar says when the cluster can't be reached at all", async () => {
		renderApp("/settings", {
			"GET /overview": () => Response.json({ error: "SeaweedFS master is unreachable" }, { status: 400 }),
		});
		expect(await screen.findByText(/Can't reach the cluster/, {}, { timeout: 4000 })).toBeTruthy();
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

	test("the toolbar says where you are: the section, then the page", async () => {
		const { routes } = await clusterApi();
		renderApp("/cluster", routes);
		await screen.findByText("Leader");
		const crumbs = within(toolbar()).getByRole("navigation", { name: "Breadcrumb" });
		expect(within(crumbs).getByText("Cluster")).toBeTruthy();
		expect(crumbs.querySelector('[aria-current="page"]')?.textContent).toBe("Nodes");
	});

	test("the toolbar gains an edge once the page scrolls under it", async () => {
		const { routes } = await clusterApi();
		renderApp("/", routes);
		await screen.findByText("Disk used");
		expect(toolbar().className).not.toContain("shadow-");
		await act(async () => {
			Object.defineProperty(window, "scrollY", { configurable: true, value: 200 });
			window.dispatchEvent(new Event("scroll"));
		});
		expect(toolbar().className).toContain("shadow-");
		Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
	});

	test("the sidebar folds to an icon rail with ⌘B, names its pages in tooltips, and remembers", async () => {
		localStorage.removeItem("kelp-sidebar-collapsed");
		const { routes } = await clusterApi();
		const first = renderApp("/cluster", routes);
		await screen.findByText("Leader");
		fireEvent.keyDown(window, { key: "b", metaKey: true });
		const expand = await screen.findByRole("button", { name: "Expand sidebar" });
		expect(localStorage.getItem("kelp-sidebar-collapsed")).toBe("1");
		const pages = screen.getAllByRole("navigation", { name: "Pages" })[0] as HTMLElement;
		expect(pages.closest("[data-rail]")).toBeTruthy();
		fireEvent.mouseEnter(within(pages).getByRole("link", { name: "Volumes" }));
		fireEvent.pointerEnter(within(pages).getByRole("link", { name: "Volumes" }));
		first.unmount();

		// A new visit opens folded, and the toolbar button unfolds it.
		renderApp("/cluster", routes);
		await screen.findByText("Leader");
		fireEvent.click(await screen.findByRole("button", { name: "Expand sidebar" }));
		expect(await screen.findByRole("button", { name: "Collapse sidebar" })).toBeTruthy();
		expect(localStorage.getItem("kelp-sidebar-collapsed")).toBe("0");
		expect(expand).toBeTruthy();
	});

	test("on narrow screens the sidebar opens as a sheet and closes after navigating", async () => {
		const { routes } = await clusterApi();
		const app = renderApp("/", routes);
		await screen.findByText("Disk used");
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
		await screen.findByText("Disk used");
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
