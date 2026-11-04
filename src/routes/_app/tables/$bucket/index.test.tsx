import { describe, expect, test } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderApp, viewerUser } from "../../../../../test/render-app.tsx";
import { settle } from "../../../../../test/settle.ts";
import { tablesApi } from "../../../../../test/streams-fixtures.ts";
import { groupTables } from "./index.tsx";

async function setup(extra: Record<string, unknown> = {}, user = undefined as typeof viewerUser | undefined) {
	const { detail, orders } = await tablesApi();
	const routes = { "GET /tables/buckets/analytics": detail, ...extra };
	return {
		detail,
		orders,
		app: user ? renderApp("/tables/analytics", routes, user) : renderApp("/tables/analytics", routes),
	};
}

describe("table bucket page", () => {
	test("groups tables under their namespaces", async () => {
		const { orders } = await tablesApi();
		const { app } = await setup({ "GET /tables/buckets/analytics/namespaces/sales/tables/orders": orders });
		const sales = await screen.findByRole("region", { name: "Namespace sales" });
		expect(within(sales).getByText("orders")).toBeTruthy();
		expect(within(sales).getByText("iceberg")).toBeTruthy();
		const finance = screen.getByRole("region", { name: "Namespace finance" });
		expect(within(finance).getByText("schema only")).toBeTruthy();
		expect(screen.getByText("s3://analytics")).toBeTruthy();
		fireEvent.click(within(sales).getByRole("link"));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/tables/analytics/sales/orders"));
	});

	test("creates a namespace", async () => {
		const { app } = await setup({ "POST /tables/buckets/analytics/namespaces": { name: "emea.retail" } });
		fireEvent.click(await screen.findByRole("button", { name: "Create namespace" }));
		const dialog = await screen.findByRole("dialog");
		fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Bad" } });
		expect(within(dialog).getByText(/Use dots to nest/).className).toContain("destructive");
		fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "emea.retail" } });
		fireEvent.click(within(dialog).getByRole("button", { name: "Create namespace" }));
		expect(await screen.findByText("Namespace emea.retail created")).toBeTruthy();
		expect(app.api.last("POST", "/tables/buckets/analytics/namespaces")?.body).toEqual({
			name: "emea.retail",
		});
	});

	test("creates a table with columns", async () => {
		const { orders } = await tablesApi();
		const { app } = await setup({
			"POST /tables/buckets/analytics/namespaces/web/tables": { name: "events", arn: "arn" },
			"GET /tables/buckets/analytics/namespaces/web/tables/events": orders,
		});
		fireEvent.click(await screen.findByRole("button", { name: "Create table" }));
		const dialog = await screen.findByRole("dialog");
		const submit = within(dialog).getByRole("button", { name: "Create table" }) as HTMLButtonElement;
		fireEvent.change(within(dialog).getByLabelText("Namespace"), { target: { value: "web" } });
		fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Events" } });
		expect(within(dialog).getByText("Lowercase letters, digits and underscores.")).toBeTruthy();
		fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "events" } });
		fireEvent.click(within(dialog).getByRole("button", { name: "Add column" }));
		expect(within(dialog).getByText("Name every column.")).toBeTruthy();
		expect(submit.disabled).toBe(true);
		fireEvent.change(within(dialog).getByLabelText("Column 2 name"), { target: { value: "id" } });
		expect(within(dialog).getByText("Column names must be unique.")).toBeTruthy();
		fireEvent.change(within(dialog).getByLabelText("Column 2 name"), { target: { value: "at" } });
		fireEvent.change(within(dialog).getByLabelText("Column 2 type"), { target: { value: "timestamptz" } });
		fireEvent.click(within(dialog).getByLabelText("Column 2 required"));
		fireEvent.click(within(dialog).getByRole("button", { name: "Add column" }));
		fireEvent.click(within(dialog).getByRole("button", { name: "Remove column 3" }));
		await settle();
		fireEvent.click(submit);
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/tables/analytics/web/events"));
		expect(app.api.last("POST", "/tables/buckets/analytics/namespaces/web/tables")?.body).toEqual({
			name: "events",
			fields: [
				{ name: "id", type: "long", required: true },
				{ name: "at", type: "timestamptz", required: true },
			],
		});
	});

	test("dismissed dialogs start fresh next time", async () => {
		await setup();
		for (const [button, field] of [
			["Create namespace", "Name"],
			["Create table", "Name"],
		] as const) {
			fireEvent.click(await screen.findByRole("button", { name: button }));
			const dialog = await screen.findByRole("dialog");
			fireEvent.change(within(dialog).getByLabelText(field), { target: { value: "draft" } });
			fireEvent.keyDown(dialog, { key: "Escape" });
			await settle(300);
			expect(screen.queryByRole("dialog")).toBeNull();
			fireEvent.click(screen.getByRole("button", { name: button }));
			expect(
				(within(await screen.findByRole("dialog")).getByLabelText(field) as HTMLInputElement).value,
			).toBe("");
			fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
			await settle(300);
		}
	});

	test("a namespace created after load can take a table right away", async () => {
		const { detail } = await tablesApi();
		let namespaces: typeof detail.namespaces = [];
		renderApp("/tables/analytics", {
			"GET /tables/buckets/analytics": () => ({ ...detail, tables: [], namespaces }),
			"POST /tables/buckets/analytics/namespaces": () => {
				namespaces = [{ name: "fresh", parts: ["fresh"], createdAt: null }];
				return { name: "fresh" };
			},
		});
		fireEvent.click(await screen.findByRole("button", { name: "Create namespace" }));
		fireEvent.change(within(await screen.findByRole("dialog")).getByLabelText("Name"), {
			target: { value: "fresh" },
		});
		fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Create namespace" }));
		expect(await screen.findByRole("region", { name: "Namespace fresh" })).toBeTruthy();
		await settle(300);
		fireEvent.click(screen.getByRole("button", { name: "Create table" }));
		const dialog = await screen.findByRole("dialog");
		fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "events" } });
		expect((within(dialog).getByRole("button", { name: "Create table" }) as HTMLButtonElement).disabled).toBe(
			false,
		);
	});

	test("an empty namespace can be deleted", async () => {
		const { detail } = await tablesApi();
		const app = renderApp("/tables/analytics", {
			"GET /tables/buckets/analytics": {
				...detail,
				namespaces: [...detail.namespaces, { name: "scratch", parts: ["scratch"], createdAt: null }],
			},
			"DELETE /tables/buckets/analytics/namespaces/scratch": { ok: true },
		});
		const scratch = await screen.findByRole("region", { name: "Namespace scratch" });
		expect(within(scratch).getByText("No tables in this namespace yet.")).toBeTruthy();
		fireEvent.click(within(scratch).getByRole("button", { name: "Delete namespace scratch" }));
		fireEvent.click(
			within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete namespace" }),
		);
		expect(await screen.findByText("Namespace scratch deleted")).toBeTruthy();
		expect(app.api.last("DELETE", "/tables/buckets/analytics/namespaces/scratch")).toBeTruthy();
	});

	test("deleting a bucket needs its name typed", async () => {
		const { detail } = await tablesApi();
		const app = renderApp("/tables/analytics", {
			"GET /tables/buckets/analytics": { ...detail, tables: [] },
			"DELETE /tables/buckets/analytics": { ok: true },
			"GET /tables/buckets": { buckets: [], icebergPort: null },
		});
		fireEvent.click(await screen.findByRole("button", { name: "Delete bucket" }));
		const dialog = await screen.findByRole("alertdialog");
		expect(
			within(dialog).getByText("The bucket and its namespaces are removed. This cannot be undone."),
		).toBeTruthy();
		fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "analytics" } });
		fireEvent.click(within(dialog).getByRole("button", { name: "Delete bucket" }));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/tables"));
	});

	test("warns that buckets with tables cannot be deleted", async () => {
		await setup();
		fireEvent.click(await screen.findByRole("button", { name: "Delete bucket" }));
		expect(await screen.findByText(/Delete its tables first/)).toBeTruthy();
	});

	test("edits tags", async () => {
		const { app } = await setup({ "PUT /tables/buckets/analytics/tags": { ok: true } });
		const save = (await screen.findByRole("button", { name: "Save tags" })) as HTMLButtonElement;
		expect(save.disabled).toBe(true);
		fireEvent.click(screen.getByRole("button", { name: "Add tag" }));
		const keys = screen.getAllByLabelText("Tag key");
		fireEvent.change(screen.getAllByLabelText("Tag value")[1] as HTMLElement, {
			target: { value: "orphan" },
		});
		expect(screen.getByText("Every tag needs a key.")).toBeTruthy();
		fireEvent.change(keys[1] as HTMLElement, { target: { value: "team" } });
		expect(screen.getByText("The key team is used twice.")).toBeTruthy();
		fireEvent.change(keys[1] as HTMLElement, { target: { value: "env" } });
		fireEvent.click(screen.getByRole("button", { name: "Remove tag team" }));
		await settle();
		fireEvent.click(save);
		expect(await screen.findByText("Tags saved")).toBeTruthy();
		expect(app.api.last("PUT", "/tables/buckets/analytics/tags")?.body).toEqual({ tags: { env: "orphan" } });
	});

	test("edits the bucket policy with validation and templates", async () => {
		const { app } = await setup({
			"PUT /tables/buckets/analytics/policy": { ok: true },
			"DELETE /tables/buckets/analytics/policy": { ok: true },
		});
		const editor = (await screen.findByLabelText("Policy JSON")) as HTMLTextAreaElement;
		expect(editor.value).toContain('"Version": "2012-10-17"');
		fireEvent.change(editor, { target: { value: "{oops" } });
		expect(screen.getByText(/Not valid JSON/)).toBeTruthy();
		fireEvent.change(editor, { target: { value: "[]" } });
		expect(screen.getByText("A policy is a JSON object.")).toBeTruthy();
		fireEvent.change(editor, { target: { value: '{"Statement":[]}' } });
		expect(screen.getByText("Add at least one statement.")).toBeTruthy();
		fireEvent.change(editor, { target: { value: "" } });
		expect(screen.getByText("No policy. Access follows each identity's own permissions.")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Deny deletes" }));
		expect(editor.value).toContain("s3tables:DeleteTable");
		fireEvent.change(editor, {
			target: { value: '{"Version":"2012-10-17","Statement":[{"Effect":"Deny"}]}' },
		});
		fireEvent.click(screen.getByRole("button", { name: "Format" }));
		expect(editor.value).toContain('\n  "Version"');
		fireEvent.click(screen.getByRole("button", { name: "Save policy" }));
		expect(await screen.findByText("Bucket policy saved")).toBeTruthy();
		expect(app.api.last("PUT", "/tables/buckets/analytics/policy")?.body).toEqual({
			policy: '{"Version":"2012-10-17","Statement":[{"Effect":"Deny"}]}',
		});
		fireEvent.click(screen.getByRole("button", { name: "Remove policy" }));
		fireEvent.click(
			within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remove policy" }),
		);
		expect(await screen.findByText("Bucket policy removed")).toBeTruthy();
	});

	test("failed saves keep the edits", async () => {
		await setup({
			"PUT /tables/buckets/analytics/policy": () =>
				Response.json({ error: "MalformedPolicy: bad principal" }, { status: 400 }),
			"PUT /tables/buckets/analytics/tags": () => Response.json({ error: "Invalid tags" }, { status: 400 }),
		});
		const editor = (await screen.findByLabelText("Policy JSON")) as HTMLTextAreaElement;
		fireEvent.change(editor, { target: { value: '{"Statement":[{}]}' } });
		fireEvent.click(screen.getByRole("button", { name: "Save policy" }));
		expect(await screen.findByText("MalformedPolicy: bad principal")).toBeTruthy();
		expect(editor.value).toBe('{"Statement":[{}]}');
		fireEvent.change(screen.getAllByLabelText("Tag value")[0] as HTMLElement, { target: { value: "x" } });
		fireEvent.click(screen.getByRole("button", { name: "Save tags" }));
		expect(await screen.findByText("Invalid tags")).toBeTruthy();
	});

	test("viewers see tags and policy read-only", async () => {
		await setup({}, viewerUser);
		expect(await screen.findByText("team=data")).toBeTruthy();
		expect(screen.getByText(/"s3tables:GetTableData"/)).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Create table" })).toBeNull();
	});

	test("viewers see empty tags and policy plainly", async () => {
		const { detail } = await tablesApi();
		renderApp(
			"/tables/analytics",
			{ "GET /tables/buckets/analytics": { ...detail, tags: {}, policy: "", namespaces: [], tables: [] } },
			viewerUser,
		);
		expect(await screen.findByText("No tags.")).toBeTruthy();
		expect(screen.getByText("No namespaces yet")).toBeTruthy();
		expect(screen.getByText("No policy. Access follows each identity's own permissions.")).toBeTruthy();
	});

	test("missing buckets explain themselves", async () => {
		renderApp("/tables/nope", {
			"GET /tables/buckets/nope": () =>
				Response.json({ error: "Table bucket nope does not exist", upstream: "admin" }, { status: 404 }),
		});
		expect(await screen.findByText("Table bucket nope does not exist")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(await screen.findByText("Table bucket nope does not exist")).toBeTruthy();
	});
});

describe("groupTables", () => {
	test("keeps empty namespaces and sorts everything", () => {
		const t = (namespace: string, name: string) => ({
			namespace,
			name,
			arn: name,
			format: "ICEBERG",
			createdAt: null,
			modifiedAt: null,
			metadataLocation: null,
		});
		expect(
			groupTables([{ name: "b", parts: ["b"], createdAt: null }], [t("z", "y"), t("z", "x")]).map((g) => [
				g.namespace,
				g.tables.map((x) => x.name),
			]),
		).toEqual([
			["b", []],
			["z", ["x", "y"]],
		]);
	});
});
