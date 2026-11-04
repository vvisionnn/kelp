import { describe, expect, test } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { accessApi } from "../../../../../test/access-fixtures.ts";
import { renderApp, viewerUser } from "../../../../../test/render-app.tsx";
import { choose } from "../../../../../test/select.ts";

describe("groups list", () => {
	test("shows status, members and policies, and opens a group", async () => {
		const { routes } = await accessApi();
		const app = renderApp("/access/groups", routes);
		expect(await screen.findByText("Disabled")).toBeTruthy();
		fireEvent.click(screen.getByText("devs"));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/access/groups/devs"));
	});

	test("every column sorts and search filters", async () => {
		const { routes } = await accessApi();
		renderApp("/access/groups", routes);
		await screen.findByText("devs");
		for (const header of ["Group", "Status", "Members", "Policies"])
			fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: header }));
		fireEvent.change(screen.getByLabelText("Search groups, members or policies"), {
			target: { value: "nobody" },
		});
		expect(screen.queryByText("devs")).toBeNull();
	});

	test("creating a group opens it", async () => {
		const { routes } = await accessApi();
		const app = renderApp("/access/groups", {
			...routes,
			"POST /iam/groups": () =>
				Response.json({ group: { name: "ops", enabled: true, members: [], policies: [] } }, { status: 201 }),
			"GET /iam/groups/ops": { group: { name: "ops", enabled: true, members: [], policies: [] } },
		});
		fireEvent.click(await screen.findByRole("button", { name: "Create group" }));
		const dialog = await screen.findByRole("dialog");
		fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "ops" } });
		fireEvent.click(within(dialog).getByRole("button", { name: "Create group" }));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/access/groups/ops"));
		expect(await screen.findByText("No members yet.")).toBeTruthy();
		expect(screen.getByText("No policies attached.")).toBeTruthy();
	});

	test("enabled groups and an empty list", async () => {
		const { routes } = await accessApi();
		renderApp("/access/groups", {
			...routes,
			"GET /iam/groups": { groups: [{ name: "ops", enabled: true, members: [], policies: [] }] },
		});
		expect(await screen.findByText("Enabled")).toBeTruthy();
		expect(screen.getByText("No members")).toBeTruthy();
	});

	test("viewers see an empty state without actions", async () => {
		const { routes } = await accessApi();
		renderApp("/access/groups", { ...routes, "GET /iam/groups": { groups: [] } }, viewerUser);
		expect(await screen.findByText("No groups yet")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Create group" })).toBeNull();
	});
});

describe("group details", () => {
	test("members, policies and status can be managed", async () => {
		const { routes } = await accessApi();
		const app = renderApp("/access/groups/devs", {
			...routes,
			"PUT /iam/groups/devs/status": { ok: true },
			"POST /iam/groups/devs/members": { ok: true },
			"DELETE /iam/groups/devs/members/bob": { ok: true },
			"DELETE /iam/groups/devs/policies/ro": { ok: true },
		});
		expect(await screen.findByText("Disabled. Its policies grant nothing until it is enabled.")).toBeTruthy();
		expect(screen.getByText("Remove its members and policies to delete it.")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Delete group" })).toBeNull();
		fireEvent.click(screen.getByRole("switch"));
		await waitFor(() =>
			expect(app.api.last("PUT", "/iam/groups/devs/status")?.body).toEqual({ enabled: true }),
		);
		expect(await screen.findByText("Group devs enabled")).toBeTruthy();

		await choose("Add member", "alice");
		await waitFor(() =>
			expect(app.api.last("POST", "/iam/groups/devs/members")?.body).toEqual({ username: "alice" }),
		);
		fireEvent.click(screen.getByRole("button", { name: "Remove bob" }));
		expect(await screen.findByText("bob removed from devs")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Remove ro" }));
		expect(await screen.findByText("Policy ro detached")).toBeTruthy();
	});

	test("attaching a policy", async () => {
		const { routes, policies } = await accessApi();
		const app = renderApp("/access/groups/devs", {
			...routes,
			"GET /iam/policies": { policies: [...policies, { ...policies[0], name: "admin-all" }] },
			"POST /iam/groups/devs/policies": { ok: true },
		});
		await choose("Attach policy", "admin-all");
		await waitFor(() =>
			expect(app.api.last("POST", "/iam/groups/devs/policies")?.body).toEqual({ policy: "admin-all" }),
		);
		expect(await screen.findByText("Policy admin-all attached")).toBeTruthy();
	});

	test("disabling and deleting", async () => {
		const { routes, groups } = await accessApi();
		const app = renderApp("/access/groups/devs", {
			...routes,
			"GET /iam/groups/devs": { group: { ...groups[0], enabled: true, members: [], policies: [] } },
			"PUT /iam/groups/devs/status": { ok: true },
			"DELETE /iam/groups/devs": { ok: true },
		});
		fireEvent.click(await screen.findByRole("switch"));
		expect(await screen.findByText("Group devs disabled")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Delete group" }));
		const dialog = await screen.findByRole("alertdialog");
		fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "devs" } });
		fireEvent.click(within(dialog).getByRole("button", { name: "Delete group" }));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/access/groups"));
	});

	test("viewers read without controls; errors retry", async () => {
		const { routes } = await accessApi();
		let fail = true;
		renderApp(
			"/access/groups/devs",
			{
				...routes,
				"GET /iam/groups/devs": () =>
					fail
						? Response.json({ error: "Group not found" }, { status: 404 })
						: routes["GET /iam/groups/devs"],
			},
			viewerUser,
		);
		expect(await screen.findByText("Group not found")).toBeTruthy();
		fail = false;
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(await screen.findByText("bob")).toBeTruthy();
		expect(screen.queryByRole("switch")).toBeNull();
		expect(screen.queryByRole("button", { name: "Remove bob" })).toBeNull();
	});
});
