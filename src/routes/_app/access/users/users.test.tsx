import { describe, expect, test } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { accessApi } from "../../../../../test/access-fixtures.ts";
import { dataTable } from "../../../../../test/data-table.ts";
import { renderApp, viewerUser } from "../../../../../test/render-app.tsx";
import { choose } from "../../../../../test/select.ts";
import { settle } from "../../../../../test/settle.ts";

const NEW_KEY = { accessKey: "AKIANEW0000000000001", secretKey: "brand-new-secret-value" };

describe("users list", () => {
	test("summarizes each user and opens details", async () => {
		const { routes } = await accessApi();
		const app = renderApp("/access/users", routes);
		expect(await screen.findByText("bob@example.com")).toBeTruthy();
		expect(screen.getAllByText("Read on media").length).toBe(2);
		expect(screen.getByText("Full admin")).toBeTruthy();
		expect(screen.getByText("Config file")).toBeTruthy();
		expect(screen.getByText("(1 inactive)")).toBeTruthy();
		fireEvent.change(screen.getByLabelText("Search users, emails or keys"), {
			target: { value: "AKIAKELPEXAMPLE00001" },
		});
		expect(screen.queryByText("a@x.io")).toBeNull();
		fireEvent.click(screen.getByText("bob@example.com"));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/access/users/bob"));
	});

	test("every column sorts", async () => {
		const { routes } = await accessApi();
		renderApp("/access/users", routes);
		await screen.findByText("bob@example.com");
		for (const header of ["User", "Access keys", "Permissions", "Policies", "Groups"])
			fireEvent.click(within(dataTable()).getByRole("button", { name: header }));
		expect(screen.getByText("bob@example.com")).toBeTruthy();
	});

	test("creating a user with a key shows the secret once, then opens the user", async () => {
		const { routes, users } = await accessApi();
		const app = renderApp("/access/users", {
			...routes,
			"POST /iam/users": () =>
				Response.json({ user: { ...users[1], username: "dave" }, key: NEW_KEY }, { status: 201 }),
			"GET /iam/users/dave": { user: { ...users[1], username: "dave" } },
		});
		fireEvent.click(await screen.findByRole("button", { name: "Create user" }));
		const dialog = await screen.findByRole("dialog");
		fireEvent.change(within(dialog).getByLabelText("Username"), { target: { value: " dave " } });
		fireEvent.change(within(dialog).getByLabelText("Email"), { target: { value: "dave@example.com" } });
		fireEvent.click(within(dialog).getByRole("button", { name: "Write" }));
		fireEvent.click(within(dialog).getByRole("button", { name: "ro" }));
		fireEvent.click(within(dialog).getByRole("button", { name: "Create user" }));
		expect(
			await screen.findByText(
				"Copy the secret now. SeaweedFS will not show it again; if it is lost, create a new key.",
			),
		).toBeTruthy();
		expect(app.api.last("POST", "/iam/users")?.body).toEqual({
			username: "dave",
			email: "dave@example.com",
			actions: ["Read", "List", "Write"],
			policies: ["ro"],
			generateKey: true,
		});
		expect(screen.getByTestId("Secret key").textContent).toBe(NEW_KEY.secretKey);
		// An outside dismissal must not lose the secret.
		fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
		await settle();
		expect(screen.getByTestId("Secret key")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "I saved the secret" }));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/access/users/dave"));
	});

	test("creating a user without a key goes straight to the user", async () => {
		const { routes, users } = await accessApi();
		const app = renderApp("/access/users", {
			...routes,
			"POST /iam/users": () =>
				Response.json({ user: { ...users[1], username: "erin" }, key: null }, { status: 201 }),
			"GET /iam/users/erin": { user: { ...users[1], username: "erin" } },
		});
		fireEvent.click(await screen.findByRole("button", { name: "Create user" }));
		const dialog = await screen.findByRole("dialog");
		fireEvent.change(within(dialog).getByLabelText("Username"), { target: { value: "erin" } });
		fireEvent.click(within(dialog).getByRole("switch"));
		fireEvent.click(within(dialog).getByRole("button", { name: "Create user" }));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/access/users/erin"));
		expect(app.api.last("POST", "/iam/users")?.body).toMatchObject({ generateKey: false });
	});

	test("closing the form discards it", async () => {
		const { routes } = await accessApi();
		renderApp("/access/users", routes);
		fireEvent.click(await screen.findByRole("button", { name: "Create user" }));
		fireEvent.change(within(await screen.findByRole("dialog")).getByLabelText("Username"), {
			target: { value: "x" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Close" }));
		await settle(300);
		fireEvent.click(screen.getByRole("button", { name: "Create user" }));
		expect(
			(within(await screen.findByRole("dialog")).getByLabelText("Username") as HTMLInputElement).value,
		).toBe("");
	});

	test("viewers cannot create users; an empty cluster invites the first one", async () => {
		const { routes } = await accessApi();
		renderApp("/access/users", { ...routes, "GET /iam/users": { users: [] } }, viewerUser);
		expect(await screen.findByText("No users yet")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Create user" })).toBeNull();
	});
});

describe("user details", () => {
	test("keys can be paused, deleted and added", async () => {
		const { routes } = await accessApi();
		const app = renderApp("/access/users/bob", {
			...routes,
			"PUT /iam/users/bob/keys/AKIAKELPEXAMPLE00006": { ok: true },
			"PUT /iam/users/bob/keys/AKIAKELPEXAMPLE00001": { ok: true },
			"DELETE /iam/users/bob/keys/AKIAKELPEXAMPLE00001": { ok: true },
			"POST /iam/users/bob/keys": () =>
				Response.json(
					{ accessKey: { accessKey: NEW_KEY.accessKey, status: "Active", createdAt: null }, key: NEW_KEY },
					{ status: 201 },
				),
		});
		fireEvent.click(await screen.findByRole("switch", { name: "Active: AKIAKELPEXAMPLE00006" }));
		await waitFor(() =>
			expect(app.api.last("PUT", "/iam/users/bob/keys/AKIAKELPEXAMPLE00006")?.body).toEqual({
				status: "Inactive",
			}),
		);
		expect(await screen.findByText("Access key deactivated")).toBeTruthy();
		fireEvent.click(screen.getByRole("switch", { name: "Active: AKIAKELPEXAMPLE00001" }));
		expect(await screen.findByText("Access key activated")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Delete AKIAKELPEXAMPLE00001" }));
		fireEvent.click(await screen.findByRole("button", { name: "Delete key" }));
		await waitFor(() =>
			expect(app.api.last("DELETE", "/iam/users/bob/keys/AKIAKELPEXAMPLE00001")).toBeTruthy(),
		);

		fireEvent.click(screen.getByRole("button", { name: "Create access key" }));
		const dialog = await screen.findByRole("dialog");
		fireEvent.click(within(dialog).getByRole("button", { name: "Create access key" }));
		expect(await screen.findByTestId("Access key")).toBeTruthy();
		expect(app.api.last("POST", "/iam/users/bob/keys")?.body).toEqual({});
		fireEvent.click(screen.getByRole("button", { name: "I saved the secret" }));
		await settle(300);
		expect(screen.queryByTestId("Access key")).toBeNull();
	});

	test("a custom key pair needs both halves", async () => {
		const { routes } = await accessApi();
		const app = renderApp("/access/users/bob", {
			...routes,
			"POST /iam/users/bob/keys": () =>
				Response.json(
					{ accessKey: { accessKey: "MINE", status: "Active", createdAt: null }, key: null },
					{ status: 201 },
				),
		});
		fireEvent.click(await screen.findByRole("button", { name: "Create access key" }));
		const dialog = await screen.findByRole("dialog");
		fireEvent.click(within(dialog).getByRole("button", { name: "Use my own key pair" }));
		const submit = within(dialog).getByRole("button", { name: "Create access key" }) as HTMLButtonElement;
		fireEvent.change(await within(dialog).findByLabelText("Access key"), { target: { value: "MINE" } });
		expect(submit.disabled).toBe(true);
		fireEvent.change(within(dialog).getByLabelText("Secret key"), { target: { value: "a-long-secret" } });
		fireEvent.click(submit);
		await waitFor(() =>
			expect(app.api.last("POST", "/iam/users/bob/keys")?.body).toEqual({
				accessKey: "MINE",
				secretKey: "a-long-secret",
			}),
		);
		expect(await screen.findByText("Access key MINE created")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Create access key" }));
		fireEvent.click(await screen.findByRole("button", { name: "Close" }));
	});

	test("profile and permissions save only when changed", async () => {
		const { routes } = await accessApi();
		const app = renderApp("/access/users/bob", { ...routes, "PUT /iam/users/bob": { user: {} } });
		const email = (await screen.findByLabelText("Email")) as HTMLInputElement;
		expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
		fireEvent.change(email, { target: { value: "robert@example.com" } });
		fireEvent.click(screen.getByRole("button", { name: "Discard" }));
		expect(email.value).toBe("bob@example.com");
		fireEvent.click(screen.getByRole("button", { name: "Remove ro" }));
		const actions = screen.getByLabelText("Actions");
		fireEvent.change(actions, { target: { value: "List:media" } });
		fireEvent.keyDown(actions, { key: "Enter" });
		fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
		await waitFor(() =>
			expect(app.api.last("PUT", "/iam/users/bob")?.body).toEqual({
				email: "bob@example.com",
				actions: ["Read:media", "List:media"],
				policies: [],
			}),
		);
		expect(await screen.findByText("Changes saved")).toBeTruthy();
	});

	test("group membership can be changed", async () => {
		const { routes, groups } = await accessApi();
		const app = renderApp("/access/users/alice", {
			...routes,
			"GET /iam/groups": { groups: [...groups, { name: "ops", enabled: true, members: [], policies: [] }] },
			"POST /iam/groups/ops/members": { ok: true },
		});
		await choose("Add to group", "ops");
		await waitFor(() =>
			expect(app.api.last("POST", "/iam/groups/ops/members")?.body).toEqual({ username: "alice" }),
		);
	});

	test("leaving a group", async () => {
		const { routes } = await accessApi();
		const app = renderApp("/access/users/bob", {
			...routes,
			"DELETE /iam/groups/devs/members/bob": { ok: true },
		});
		fireEvent.click(await screen.findByRole("button", { name: "Remove from devs" }));
		expect(await screen.findByText("Removed from devs")).toBeTruthy();
		expect(app.api.last("DELETE", "/iam/groups/devs/members/bob")).toBeTruthy();
		expect(screen.getByText("nightly backups")).toBeTruthy();
	});

	test("deleting a user asks for the name and returns to the list", async () => {
		const { routes } = await accessApi();
		const app = renderApp("/access/users/bob", { ...routes, "DELETE /iam/users/bob": { ok: true } });
		fireEvent.click(await screen.findByRole("button", { name: "Delete user" }));
		const dialog = await screen.findByRole("alertdialog");
		fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "bob" } });
		fireEvent.click(within(dialog).getByRole("button", { name: "Delete user" }));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/access/users"));
	});

	test("users from the config file are read-only", async () => {
		const { routes } = await accessApi();
		renderApp("/access/users/kelp-dev", routes);
		expect(await screen.findByText(/defined in the S3 config file/)).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Delete user" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Create access key" })).toBeNull();
		expect((screen.getByLabelText("Email") as HTMLInputElement).disabled).toBe(true);
		expect(screen.getByText("Not in any group.")).toBeTruthy();
		expect(screen.getByText("None.")).toBeTruthy();
	});

	test("a user without keys explains it, and errors can be retried", async () => {
		const { routes, users } = await accessApi();
		let fail = true;
		renderApp("/access/users/alice", {
			...routes,
			"GET /iam/users/alice": () =>
				fail
					? Response.json({ error: "User not found", upstream: "admin" }, { status: 404 })
					: { user: { ...users[0], accessKeys: [] } },
		});
		expect(await screen.findByText("User not found")).toBeTruthy();
		fail = false;
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(await screen.findByText("No access keys")).toBeTruthy();
	});
});

describe("users dashboard", () => {
	test("shows who can reach what, how users get access and what needs attention", async () => {
		const { routes, users } = await accessApi();
		const stale = new Date(Date.now() - 200 * 86_400_000).toISOString();
		renderApp("/access/users", {
			...routes,
			"GET /iam/users": {
				users: [
					...users,
					{ ...users[0], username: "keyless", accessKeys: [] },
					{
						...users[2],
						username: "root",
						isStatic: false,
						accessKeys: [{ accessKey: "OLD", status: "Active", createdAt: stale }],
					},
				],
			},
			"GET /buckets": { buckets: [{ name: "media" }, { name: "logs" }] },
		});
		const matrix = await screen.findByRole("table", { name: "Access by user and bucket" });
		expect(within(matrix).getByRole("link", { name: "bob" })).toBeTruthy();
		expect(
			within(matrix).getAllByRole("img", { name: /kelp-dev: Full control on media \(all buckets\)/ }),
		).toHaveLength(1);
		expect(screen.getByRole("img", { name: "Users by how they get access" })).toBeTruthy();
		expect(screen.getByRole("list", { name: "Users who can reach each bucket" })).toBeTruthy();
		expect(screen.getByRole("img", { name: "Access keys by age" })).toBeTruthy();
		expect(screen.getByText("root has full control with a 200-day-old key")).toBeTruthy();
		expect(screen.getByText("keyless has no access keys")).toBeTruthy();
		expect(screen.getByRole("region", { name: "Keys to rotate" }).textContent).toContain("1");
	});

	test("long attention lists are cut short", async () => {
		const { routes, users } = await accessApi();
		const many = Array.from({ length: 8 }, (_, i) => ({
			...users[0],
			username: `quiet-${i}`,
			accessKeys: [],
		}));
		renderApp("/access/users", {
			...routes,
			"GET /iam/users": { users: many },
			"GET /buckets": { buckets: [] },
		});
		expect(await screen.findByText("And 2 more.")).toBeTruthy();
	});
});

describe("user reach", () => {
	test("a user's page shows what they can reach and how old their keys are", async () => {
		const { routes } = await accessApi();
		renderApp("/access/users/bob", routes);
		expect(await screen.findByText("What bob can reach")).toBeTruthy();
		expect(screen.getByRole("region", { name: "Buckets reached" })).toBeTruthy();
		expect(screen.getByRole("region", { name: "Oldest active key" })).toBeTruthy();
	});

	test("an admin reaches every bucket", async () => {
		const { routes } = await accessApi();
		renderApp("/access/users/kelp-dev", routes);
		const reached = await screen.findByRole("region", { name: "Buckets reached" });
		expect(reached.textContent).toContain("All");
		expect(reached.textContent).toContain("Full control on every bucket");
	});
});
