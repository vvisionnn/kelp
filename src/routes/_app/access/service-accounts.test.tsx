import { describe, expect, test } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { accessApi } from "../../../../test/access-fixtures.ts";
import { choose } from "../../../../test/access-select.ts";
import { renderApp, viewerUser } from "../../../../test/render-app.tsx";
import { settle } from "../../../../test/settle.ts";
import { describeExpiry, expiryFrom } from "./service-accounts.tsx";

const SECRET = { accessKey: "ABIANEW", secretKey: "sa-secret-value" };
const ID = "sa:bob:002800232799";
const PATH = `/iam/service-accounts/${encodeURIComponent(ID)}`;

describe("service accounts", () => {
	test("lists accounts and opens one in a side sheet", async () => {
		const { routes } = await accessApi();
		const app = renderApp("/access/service-accounts", routes);
		expect(await screen.findByText("nightly backups")).toBeTruthy();
		fireEvent.click(screen.getByText("nightly backups"));
		await waitFor(() => expect(app.router.state.location.search).toEqual({ account: ID }));
		const sheet = await screen.findByRole("dialog");
		expect(within(sheet).getByText(ID)).toBeTruthy();
		fireEvent.click(within(sheet).getByRole("button", { name: "Close" }));
		await waitFor(() => expect(app.router.state.location.search).toEqual({}));
	});

	test("creating one shows its secret once", async () => {
		const { routes, serviceAccounts } = await accessApi();
		const app = renderApp("/access/service-accounts", {
			...routes,
			"POST /iam/service-accounts": () =>
				Response.json({ account: serviceAccounts[1], key: SECRET }, { status: 201 }),
		});
		fireEvent.click(await screen.findByRole("button", { name: "Create service account" }));
		const dialog = await screen.findByRole("dialog");
		const submit = within(dialog).getByRole("button", {
			name: "Create service account",
		}) as HTMLButtonElement;
		expect(submit.disabled).toBe(true);
		await choose("Acts as", "bob");
		fireEvent.change(within(dialog).getByLabelText("Description"), { target: { value: " backups " } });
		await choose("Expires", "On a date");
		expect(submit.disabled).toBe(true);
		fireEvent.change(within(dialog).getByLabelText("Expiry date"), { target: { value: "2030-01-31" } });
		fireEvent.click(submit);
		expect(await screen.findByTestId("Secret key")).toBeTruthy();
		const body = app.api.last("POST", "/iam/service-accounts")?.body as Record<string, string>;
		expect(body).toMatchObject({ parentUser: "bob", description: "backups" });
		expect(new Date(body.expiresAt as string).getFullYear()).toBe(2030);
		fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
		await settle();
		expect(screen.getByTestId("Secret key")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "I saved the secret" }));
		await settle(300);
		expect(screen.queryByTestId("Secret key")).toBeNull();
	});

	test("an account without expiry is sent without one", async () => {
		const { routes, serviceAccounts } = await accessApi();
		const app = renderApp("/access/service-accounts", {
			...routes,
			"POST /iam/service-accounts": () =>
				Response.json({ account: serviceAccounts[1], key: SECRET }, { status: 201 }),
		});
		fireEvent.click(await screen.findByRole("button", { name: "Create service account" }));
		await choose("Acts as", "alice");
		fireEvent.click(
			within(await screen.findByRole("dialog")).getByRole("button", { name: "Create service account" }),
		);
		await waitFor(() =>
			expect(app.api.last("POST", "/iam/service-accounts")?.body).toEqual({
				parentUser: "alice",
				description: "",
			}),
		);
		fireEvent.click(await screen.findByRole("button", { name: "I saved the secret" }));
	});

	test("the sheet pauses, edits and deletes an account", async () => {
		const { routes } = await accessApi();
		const app = renderApp(`/access/service-accounts?account=${encodeURIComponent(ID)}`, {
			...routes,
			[`PUT ${PATH}`]: { serviceAccount: {} },
			[`DELETE ${PATH}`]: { ok: true },
		});
		const sheet = await screen.findByRole("dialog");
		fireEvent.click(within(sheet).getByRole("switch"));
		await waitFor(() => expect(app.api.last("PUT", PATH)?.body).toEqual({ status: "Inactive" }));
		const save = within(sheet).getByRole("button", { name: "Save changes" }) as HTMLButtonElement;
		expect(save.disabled).toBe(true);
		fireEvent.change(within(sheet).getByLabelText("Description"), { target: { value: "weekly backups" } });
		await choose("Change expiry", "In 90 days");
		fireEvent.click(save);
		await waitFor(() => {
			const body = app.api.last("PUT", PATH)?.body as Record<string, string>;
			expect(body.description).toBe("weekly backups");
			expect(body.expiresAt).toBeTruthy();
		});
		await choose("Change expiry", "On a date");
		fireEvent.change(within(sheet).getByLabelText("Expiry date"), { target: { value: "2031-05-01" } });
		fireEvent.click(within(sheet).getByRole("button", { name: "Delete service account" }));
		fireEvent.click(await screen.findByRole("button", { name: "Delete service account" }));
		await waitFor(() => expect(app.api.last("DELETE", PATH)).toBeTruthy());
		await waitFor(() => expect(app.router.state.location.search).toEqual({}));
	});

	test("viewers see details without controls; empty list", async () => {
		const { routes } = await accessApi();
		renderApp(`/access/service-accounts?account=${encodeURIComponent(ID)}`, routes, viewerUser);
		const sheet = await screen.findByRole("dialog");
		expect(within(sheet).getByText("Status: Active")).toBeTruthy();
		expect(within(sheet).queryByRole("switch")).toBeNull();
	});

	test("an empty list invites the first account", async () => {
		const { routes } = await accessApi();
		renderApp("/access/service-accounts", {
			...routes,
			"GET /iam/service-accounts": { serviceAccounts: [] },
		});
		expect(await screen.findByText("No service accounts")).toBeTruthy();
		expect(screen.getAllByRole("button", { name: "Create service account" }).length).toBe(2);
	});

	test("every column sorts", async () => {
		const { routes } = await accessApi();
		renderApp("/access/service-accounts", routes);
		await screen.findByText("nightly backups");
		for (const header of ["Service account", "Acts as", "Access key", "Status", "Expires"])
			fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: header }));
		expect(screen.getByText("ci runner")).toBeTruthy();
		fireEvent.change(screen.getByLabelText("Search accounts, users or keys"), { target: { value: "alice" } });
		expect(screen.queryByText("nightly backups")).toBeNull();
	});

	test("expired accounts are flagged", async () => {
		const { routes, serviceAccounts } = await accessApi();
		renderApp("/access/service-accounts", {
			...routes,
			"GET /iam/service-accounts": {
				serviceAccounts: [{ ...serviceAccounts[0], expiresAt: "2020-01-01T00:00:00.000Z", description: "" }],
			},
		});
		expect(await screen.findByText(/^Expired/)).toBeTruthy();
		expect(screen.getByText("No description")).toBeTruthy();
	});
});

describe("expiry helpers", () => {
	const now = Date.parse("2026-01-01T00:00:00Z");
	test("presets and custom dates", () => {
		expect(expiryFrom("never", "", now)).toBeUndefined();
		expect(expiryFrom("30", "", now)).toBe("2026-01-31T00:00:00.000Z");
		expect(expiryFrom("custom", "", now)).toBeUndefined();
		expect(expiryFrom("custom", "2026-02-01", now)).toBe(new Date("2026-02-01T23:59:59").toISOString());
		expect(expiryFrom("bogus", "", now)).toBeUndefined();
	});

	test("describes expiry", () => {
		expect(describeExpiry(null, now)).toEqual({ text: "Never", expired: false });
		expect(describeExpiry("2025-12-01T00:00:00Z", now).expired).toBe(true);
		expect(describeExpiry("2027-12-01T00:00:00Z", now).expired).toBe(false);
	});
});
