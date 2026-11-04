import { describe, expect, test } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderApp, viewerUser } from "../../../../../test/render-app.tsx";
import { choose } from "../../../../../test/select.ts";
import { settle } from "../../../../../test/settle.ts";
import { tablesApi } from "../../../../../test/streams-fixtures.ts";
import { snapshotHighlights } from "./$namespace.$table.tsx";

const ORDERS = "/tables/buckets/analytics/namespaces/sales/tables/orders";

async function setup(
	path = "/tables/analytics/sales/orders",
	extra: Record<string, unknown> = {},
	user?: typeof viewerUser,
) {
	const api = await tablesApi();
	const routes = { [`GET ${ORDERS}`]: api.orders, [`GET ${ORDERS}/preview`]: api.preview, ...extra };
	const app = user ? renderApp(path, routes, user) : renderApp(path, routes);
	return { ...api, app };
}

describe("table page", () => {
	test("headlines the table and shows its schema and partitioning", async () => {
		await setup();
		expect(await screen.findByText("placed_at")).toBeTruthy();
		expect(screen.getByText("timestamptz")).toBeTruthy();
		expect(screen.getAllByText("required")).toHaveLength(5);
		expect(screen.getByText("optional")).toBeTruthy();
		expect(screen.getByText("510")).toBeTruthy();
		expect(screen.getByText("identity")).toBeTruthy();
		expect(screen.getByText("Unsorted.")).toBeTruthy();
	});

	test("nested columns expand and collapse; evolved schemas say so", async () => {
		const { orders } = await tablesApi();
		const iceberg = orders.iceberg;
		if (!iceberg) throw new Error("fixture");
		renderApp("/tables/analytics/sales/orders", {
			[`GET ${ORDERS}`]: {
				...orders,
				iceberg: {
					...iceberg,
					schemaCount: 2,
					schemaId: 1,
					fields: [
						{
							id: 1,
							name: "address",
							type: "struct",
							required: false,
							doc: "Where it ships",
							children: [{ id: 2, name: "city", type: "string", required: true, doc: null, children: [] }],
						},
					],
					partition: [],
					sortOrder: [
						{ sourceName: "address.city", transform: "identity", direction: "asc", nullOrder: "nulls-first" },
					],
				},
			},
		});
		expect(await screen.findByText("Schema 1 of 2. The table's schema has evolved.")).toBeTruthy();
		expect(screen.getByText("— Where it ships")).toBeTruthy();
		expect(screen.getByText("city")).toBeTruthy();
		expect(screen.getByText("Not partitioned.")).toBeTruthy();
		expect(screen.getByText("asc, nulls first")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Collapse address" }));
		await settle(300);
		expect(screen.queryByText("city")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Expand address" }));
		expect(await screen.findByText("city")).toBeTruthy();
	});

	test("previews rows and switches files and snapshots", async () => {
		const { app, preview } = await setup("/tables/analytics/sales/orders?tab=data");
		const files = await screen.findByRole("list", { name: "Data files" });
		expect(within(files).getAllByRole("button")).toHaveLength(9);
		expect(await screen.findByText("Bo Lindqvist")).toBeTruthy();
		expect(screen.getByRole("columnheader", { name: "placed_at" })).toBeTruthy();
		const second = preview.files[1]?.path as string;
		fireEvent.click(within(files).getAllByRole("button")[1] as HTMLElement);
		await waitFor(() => expect(app.api.last("GET", `${ORDERS}/preview`)?.query.get("file")).toBe(second));
		await choose("Snapshot", "1000001");
		await waitFor(() =>
			expect(app.api.last("GET", `${ORDERS}/preview`)?.query.get("snapshot")).toBe("1000001"),
		);
		expect(app.api.last("GET", `${ORDERS}/preview`)?.query.get("file")).toBeNull();
	});

	test("preview notes and failures are shown", async () => {
		const { preview } = await tablesApi();
		let fail = true;
		await setup("/tables/analytics/sales/orders?tab=data", {
			[`GET ${ORDERS}/preview`]: () =>
				fail
					? Response.json(
							{ error: "Could not read the table's files: boom", upstream: "filer" },
							{ status: 422 },
						)
					: { ...preview, files: [], rows: [], notes: ["This snapshot has delete files."], file: null },
		});
		expect(await screen.findByText("Could not read the table's files: boom")).toBeTruthy();
		fail = false;
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(await screen.findByText("This snapshot has delete files.")).toBeTruthy();
		expect(screen.getByText("No data files.")).toBeTruthy();
	});

	test("snapshot history leads to the data of a past version", async () => {
		const { app } = await setup("/tables/analytics/sales/orders?tab=snapshots");
		expect(await screen.findByText("current")).toBeTruthy();
		expect(screen.getByText("90 rows added")).toBeTruthy();
		expect(screen.getByText("240 rows in total")).toBeTruthy();
		fireEvent.click(screen.getAllByRole("button", { name: "Browse this version" })[2] as HTMLElement);
		await waitFor(() =>
			expect(app.router.state.location.search).toMatchObject({ tab: "data", snapshot: "1000001" }),
		);
	});

	test("details list locations, properties, refs and history", async () => {
		await setup("/tables/analytics/sales/orders?tab=details");
		expect(await screen.findByText("s3://analytics/sales/orders")).toBeTruthy();
		expect(screen.getByText("Iceberg v2")).toBeTruthy();
		expect(screen.getByText("write.format.default")).toBeTruthy();
		expect(screen.getByText("main")).toBeTruthy();
		expect(screen.getByText("v1.metadata.json")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Copy table uuid" })).toBeTruthy();
	});

	test("access tab edits the table policy and tags", async () => {
		const { app } = await setup("/tables/analytics/sales/orders?tab=access", {
			[`PUT ${ORDERS}/policy`]: { ok: true },
			[`DELETE ${ORDERS}/policy`]: { ok: true },
			[`PUT ${ORDERS}/tags`]: { ok: true },
		});
		const editor = (await screen.findByLabelText("Policy JSON")) as HTMLTextAreaElement;
		fireEvent.click(screen.getByRole("button", { name: "Read only" }));
		expect(editor.value).toContain("table/sales/orders");
		fireEvent.click(screen.getByRole("button", { name: "Save policy" }));
		expect(await screen.findByText("Table policy saved")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Remove policy" }));
		fireEvent.click(
			within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remove policy" }),
		);
		expect(await screen.findByText("Table policy removed")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Remove tag pii" }));
		fireEvent.click(screen.getByRole("button", { name: "Save tags" }));
		expect(await screen.findByText("Tags saved")).toBeTruthy();
		expect(app.api.last("PUT", `${ORDERS}/tags`)?.body).toEqual({ tags: { owner: "sales-ops" } });
	});

	test("deleting a table needs its name typed", async () => {
		const { app } = await setup("/tables/analytics/sales/orders", {
			[`DELETE ${ORDERS}`]: { ok: true },
			"GET /tables/buckets/analytics": (await tablesApi()).detail,
		});
		fireEvent.click(await screen.findByRole("button", { name: "Delete table" }));
		const dialog = await screen.findByRole("alertdialog");
		fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "orders" } });
		fireEvent.click(within(dialog).getByRole("button", { name: "Delete table" }));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/tables/analytics"));
	});

	test("schema-only tables have nothing to preview or travel to", async () => {
		const { invoices } = await tablesApi();
		renderApp("/tables/analytics/finance/invoices", {
			"GET /tables/buckets/analytics/namespaces/finance/tables/invoices": {
				...invoices,
				metadataError: "Could not read table metadata: gone",
			},
		});
		expect(await screen.findByText("Could not read table metadata: gone")).toBeTruthy();
		expect(screen.getByText("due_on")).toBeTruthy();
		fireEvent.click(screen.getByRole("tab", { name: "Data" }));
		expect(await screen.findByText("No data yet")).toBeTruthy();
		fireEvent.click(screen.getByRole("tab", { name: "Snapshots" }));
		expect(await screen.findByText("No snapshots yet")).toBeTruthy();
		fireEvent.click(screen.getByRole("tab", { name: "Details" }));
		expect(await screen.findByText("No properties.")).toBeTruthy();
	});

	test("tables without any metadata say so", async () => {
		const { invoices } = await tablesApi();
		renderApp("/tables/analytics/finance/invoices?tab=schema", {
			"GET /tables/buckets/analytics/namespaces/finance/tables/invoices": {
				...invoices,
				iceberg: null,
				owner: "",
			},
		});
		expect(await screen.findByText("No schema yet")).toBeTruthy();
	});

	test("viewers get a read-only view", async () => {
		await setup("/tables/analytics/sales/orders?tab=access", {}, viewerUser);
		expect(await screen.findByText("owner=sales-ops")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Delete table" })).toBeNull();
	});

	test("missing tables explain themselves", async () => {
		renderApp("/tables/analytics/sales/nope", {
			"GET /tables/buckets/analytics/namespaces/sales/tables/nope": () =>
				Response.json(
					{ error: "Table sales.nope does not exist in analytics", upstream: "admin" },
					{ status: 404 },
				),
		});
		expect(await screen.findByText("Table sales.nope does not exist in analytics")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(await screen.findByText("Table sales.nope does not exist in analytics")).toBeTruthy();
	});
});

describe("snapshotHighlights", () => {
	test("summarizes non-zero changes", () => {
		const snapshot = {
			id: "1",
			parentId: null,
			sequenceNumber: 1,
			timestamp: null,
			operation: "overwrite",
			manifestList: null,
			schemaId: 0,
			current: false,
			summary: {
				"added-records": "10",
				"deleted-records": "4",
				"deleted-data-files": "1",
				"added-files-size": "2048",
				"added-data-files": "0",
			},
		};
		expect(snapshotHighlights(snapshot)).toEqual([
			"10 rows added",
			"4 rows deleted",
			"1 files removed",
			"2 KiB written",
		]);
	});
});
