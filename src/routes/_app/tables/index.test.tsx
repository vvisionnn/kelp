import { describe, expect, mock, test } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderApp, viewerUser } from "../../../../test/render-app.tsx";
import { settle } from "../../../../test/settle.ts";
import { tablesApi } from "../../../../test/streams-fixtures.ts";
import { catalogUri } from "./index.tsx";

const config = { kelp: { s3Endpoint: "https://s3.example.com" } };

describe("tables page", () => {
	test("lists table buckets and how engines connect", async () => {
		const { list } = await tablesApi();
		renderApp("/tables", { "GET /tables/buckets": list, "GET /system/config": config });
		const card = await screen.findByRole("link", { name: /analytics/ });
		expect(within(card).getByText(/owned by kelp-dev/)).toBeTruthy();
		expect(within(card).getByText("1 policy rule")).toBeTruthy();
		expect(await screen.findByText("https://s3.example.com:8181")).toBeTruthy();
		expect(screen.getByText(/warehouse="s3:\/\/analytics"/)).toBeTruthy();
	});

	test("an empty system invites creating a bucket", async () => {
		renderApp("/tables", { "GET /tables/buckets": { buckets: [], icebergPort: null } });
		expect(await screen.findByText("No table buckets yet")).toBeTruthy();
	});

	test("creates a table bucket and opens it", async () => {
		const { list, detail } = await tablesApi();
		const create = mock(() => Response.json({ name: "lake", arn: "arn:lake" }, { status: 201 }));
		const app = renderApp("/tables", {
			"GET /tables/buckets": list,
			"GET /system/config": config,
			"POST /tables/buckets": create,
			"GET /tables/buckets/lake": { ...detail, bucket: { ...detail.bucket, name: "lake" } },
		});
		fireEvent.click(await screen.findByRole("button", { name: "Create table bucket" }));
		const dialog = await screen.findByRole("dialog");
		const submit = within(dialog).getByRole("button", { name: "Create table bucket" }) as HTMLButtonElement;
		fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Lake!" } });
		expect(submit.disabled).toBe(true);
		fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "lake" } });
		fireEvent.change(within(dialog).getByLabelText("Owner account"), { target: { value: "ana" } });
		fireEvent.click(submit);
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/tables/lake"));
		expect(app.api.last("POST", "/tables/buckets")?.body).toEqual({ name: "lake", owner: "ana" });
	});

	test("a dismissed bucket dialog starts fresh", async () => {
		const { list } = await tablesApi();
		renderApp("/tables", { "GET /tables/buckets": list, "GET /system/config": config });
		fireEvent.click(await screen.findByRole("button", { name: "Create table bucket" }));
		const dialog = await screen.findByRole("dialog");
		fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "draft" } });
		fireEvent.keyDown(dialog, { key: "Escape" });
		await settle(300);
		fireEvent.click(screen.getByRole("button", { name: "Create table bucket" }));
		expect((within(await screen.findByRole("dialog")).getByLabelText("Name") as HTMLInputElement).value).toBe(
			"",
		);
	});

	test("viewers cannot create buckets", async () => {
		const { list } = await tablesApi();
		renderApp("/tables", { "GET /tables/buckets": list, "GET /system/config": config }, viewerUser);
		expect(await screen.findByRole("link", { name: /analytics/ })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Create table bucket" })).toBeNull();
	});

	test("explains failures", async () => {
		renderApp("/tables", {
			"GET /tables/buckets": () => Response.json({ error: "admin down", upstream: "admin" }, { status: 502 }),
		});
		expect(await screen.findByText("SeaweedFS admin reported a problem")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(await screen.findByText("SeaweedFS admin reported a problem")).toBeTruthy();
	});
});

describe("catalogUri", () => {
	test("uses the S3 host with the catalog port", () => {
		expect(catalogUri("https://s3.example.com", 8181, "kelp.local")).toBe("https://s3.example.com:8181");
		expect(catalogUri(null, null, "kelp.local")).toBe("http://kelp.local:8181");
		expect(catalogUri("not a url", 9000, "kelp.local")).toBe("http://kelp.local:9000");
	});
});
