import { describe, expect, test } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { objectsApi } from "../../../../test/objects-fixtures.ts";
import { choose } from "../../../../test/objects-helpers.ts";
import { renderApp, viewerUser } from "../../../../test/render-app.tsx";
import { settle } from "../../../../test/settle.ts";

async function openCreate() {
	fireEvent.click(await screen.findByRole("button", { name: "Create bucket" }));
	return screen.findByRole("dialog");
}

describe("buckets page", () => {
	test("lists buckets with their data, quota, owner and flags", async () => {
		const { routes } = await objectsApi();
		renderApp("/buckets", routes);
		const table = await screen.findByRole("table");
		for (const name of ["archive", "backups", "media"]) expect(within(table).getByText(name)).toBeTruthy();
		expect(within(table).getByText("Object lock")).toBeTruthy();
		expect(within(table).getAllByText("Versioned").length).toBe(2);
		expect(within(table).getByText("Lifecycle")).toBeTruthy();
		expect(within(table).getByText("Policy")).toBeTruthy();
		expect(within(table).getAllByText("No limit").length).toBe(1);
		expect(within(table).getAllByRole("meter").length).toBe(2);
		expect(screen.getByText("Object data")).toBeTruthy();
	});

	test("search narrows the list and rows open the bucket", async () => {
		const { routes } = await objectsApi();
		const app = renderApp("/buckets", routes);
		fireEvent.change(await screen.findByLabelText("Search buckets"), { target: { value: "back" } });
		const table = screen.getByRole("table");
		expect(within(table).queryByText("media")).toBeNull();
		fireEvent.click(within(table).getByText("10 GiB", { exact: false }));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/buckets/backups"));
	});

	test("creates a bucket with quota, versioning and object lock, then opens it", async () => {
		const { routes } = await objectsApi();
		const app = renderApp("/buckets", { ...routes, "POST /buckets": { name: "team-assets" } });
		const dialog = await openCreate();
		const name = within(dialog).getByLabelText("Name");
		fireEvent.change(name, { target: { value: "Team-Assets" } });
		expect((name as HTMLInputElement).value).toBe("team-assets");
		fireEvent.click(within(dialog).getByRole("switch", { name: /Limit storage/ }));
		fireEvent.change(within(dialog).getByLabelText("Quota size"), { target: { value: "5" } });
		fireEvent.click(within(dialog).getByRole("switch", { name: /Object lock/ }));
		expect(
			within(dialog)
				.getByRole("switch", { name: /Keep every version/ })
				.getAttribute("aria-checked"),
		).toBe("true");
		fireEvent.click(within(dialog).getByRole("radio", { name: /Compliance/ }));
		fireEvent.change(within(dialog).getByLabelText("Default retention (days)"), { target: { value: "30" } });
		fireEvent.click(within(dialog).getByRole("button", { name: "Create bucket" }));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/buckets/team-assets"));
		expect(app.api.last("POST", "/buckets")?.body).toEqual({
			name: "team-assets",
			owner: "",
			quotaBytes: 5 * 1024 ** 3,
			versioning: true,
			objectLock: { mode: "COMPLIANCE", retentionDays: 30 },
		});
		expect(await screen.findByText("Bucket team-assets created")).toBeTruthy();
	});

	test("creates a plain bucket with an owner", async () => {
		const { routes } = await objectsApi();
		const app = renderApp("/buckets", { ...routes, "POST /buckets": { name: "plain" } });
		const dialog = await openCreate();
		fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "plain" } });
		fireEvent.click(within(dialog).getByRole("switch", { name: /Keep every version/ }));
		await choose(within(dialog).getByRole("combobox", { name: "Owner" }), "ci-bot");
		fireEvent.click(within(dialog).getByRole("button", { name: "Create bucket" }));
		await waitFor(() => expect(app.api.last("POST", "/buckets")).toBeTruthy());
		expect(app.api.last("POST", "/buckets")?.body).toEqual({
			name: "plain",
			owner: "ci-bot",
			quotaBytes: null,
			versioning: true,
			objectLock: null,
		});
	});

	test("explains invalid names and keeps the dialog open on errors", async () => {
		const { routes } = await objectsApi();
		const app = renderApp("/buckets", {
			...routes,
			"POST /buckets": () =>
				Response.json(
					{ error: "Failed to create bucket: already exists", upstream: "admin" },
					{ status: 500 },
				),
		});
		const dialog = await openCreate();
		const name = within(dialog).getByLabelText("Name");
		fireEvent.change(name, { target: { value: "ab" } });
		fireEvent.blur(name);
		expect(within(dialog).getByText("Use 3 to 63 characters")).toBeTruthy();
		fireEvent.click(within(dialog).getByRole("button", { name: "Create bucket" }));
		expect(app.api.last("POST", "/buckets")).toBeUndefined();
		fireEvent.change(name, { target: { value: "media" } });
		fireEvent.click(within(dialog).getByRole("button", { name: "Create bucket" }));
		expect(await screen.findByText("Failed to create bucket: already exists")).toBeTruthy();
		expect(screen.getByRole("dialog")).toBeTruthy();
	});

	test("viewers see buckets but cannot create them", async () => {
		const { routes } = await objectsApi();
		renderApp("/buckets", { ...routes, "GET /buckets": { buckets: [] } }, viewerUser);
		expect(await screen.findByText("No buckets yet")).toBeTruthy();
		expect(screen.getByText("An administrator can create buckets for S3 clients.")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Create bucket" })).toBeNull();
	});

	test("admins get a create action in the empty state", async () => {
		const { routes } = await objectsApi();
		renderApp("/buckets", { ...routes, "GET /buckets": { buckets: [] } });
		expect(await screen.findByText("Create a bucket to start storing objects over S3.")).toBeTruthy();
		expect(screen.getAllByRole("button", { name: "Create bucket" }).length).toBe(2);
	});

	test("sorts by files and quota, and the name links to the bucket", async () => {
		const { routes } = await objectsApi();
		const app = renderApp("/buckets", routes);
		const table = await screen.findByRole("table");
		const names = () =>
			within(table)
				.getAllByRole("link")
				.map((l) => l.textContent);
		fireEvent.click(within(table).getByText("Files"));
		expect(names()).toEqual(["archive", "backups", "media"]);
		fireEvent.click(within(table).getByText("Quota"));
		expect(names().sort()).toEqual(["archive", "backups", "media"]);
		fireEvent.click(within(table).getByRole("link", { name: "archive" }));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/buckets/archive"));
	});

	test("closing the create dialog starts fresh next time", async () => {
		const { routes } = await objectsApi();
		renderApp("/buckets", routes);
		let dialog = await openCreate();
		fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "draft" } });
		fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
		await settle(300);
		dialog = await openCreate();
		expect((within(dialog).getByLabelText("Name") as HTMLInputElement).value).toBe("");
		fireEvent.click(within(dialog).getByRole("switch", { name: /Object lock/ }));
		fireEvent.click(within(dialog).getByRole("switch", { name: /Object lock/ }));
		await settle(300);
		expect(within(dialog).queryByRole("radio", { name: /Governance/ })).toBeNull();
	});

	test("a failing list can be retried", async () => {
		const { routes } = await objectsApi();
		let fail = true;
		renderApp("/buckets", {
			...routes,
			"GET /buckets": () =>
				fail
					? Response.json({ error: "admin is unreachable", upstream: "admin" }, { status: 502 })
					: routes["GET /buckets"],
		});
		expect(await screen.findByText("admin is unreachable")).toBeTruthy();
		fail = false;
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(await screen.findByRole("table")).toBeTruthy();
	});
});
