import { describe, expect, test } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderApp, viewerUser } from "../../../../test/render-app.tsx";
import { pickSegment } from "../../../../test/segment.ts";
import { busyInventory, realInventory } from "../../../../test/storage-fixtures.ts";
import { makeTelemetry } from "../../../../test/telemetry-fixtures.ts";

describe("collections page", () => {
	test("shows where the bytes are and every collection", async () => {
		const app = renderApp("/collections", { "GET /storage": busyInventory() });
		expect(await screen.findByRole("img", { name: "Stored bytes by collection" })).toBeTruthy();
		expect(screen.getByRole("list", { name: "Files by collection" })).toBeTruthy();
		expect(screen.getByRole("list", { name: "Average object size by collection" })).toBeTruthy();
		expect(screen.getByRole("region", { name: "Average object" })).toBeTruthy();
		expect(screen.getByRole("link", { name: "archive" })).toBeTruthy();
		const media = screen.getByRole("link", { name: "media" }).closest("tr") as HTMLElement;
		expect(within(media).getByText("001")).toBeTruthy();
		fireEvent.click(media);
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/collections/media"));
	});

	test("shows growth trends and a range control when metrics are sampled", async () => {
		const app = renderApp("/collections", {
			"GET /storage": busyInventory(),
			"GET /telemetry": makeTelemetry(),
		});
		const stored = await screen.findByRole("region", { name: "Stored" });
		expect(within(stored).getByRole("img", { name: "Stored trend" })).toBeTruthy();
		const range = screen.getByRole("radiogroup", { name: "Time range" });
		pickSegment(within(range).getByRole("radio", { name: "6h" }));
		await waitFor(() => expect(app.api.last("GET", "/telemetry")?.query.get("range")).toBe("6h"));
	});

	test("sorts by garbage, searches, and retries after errors", async () => {
		let fail = true;
		renderApp("/collections", {
			"GET /storage": () =>
				fail ? Response.json({ error: "down", upstream: "admin" }, { status: 502 }) : busyInventory(),
		});
		expect(await screen.findByText("SeaweedFS admin reported a problem")).toBeTruthy();
		fail = false;
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		await screen.findByRole("link", { name: "media" });
		fireEvent.click(screen.getByText("Garbage"));
		fireEvent.change(screen.getByLabelText("Search collections"), { target: { value: "vid" } });
		expect(screen.getByRole("link", { name: "videos" })).toBeTruthy();
		expect(screen.queryByRole("link", { name: "media" })).toBeNull();
	});

	test("an empty cluster explains collections", async () => {
		const inventory = await realInventory();
		renderApp("/collections", { "GET /storage": { ...inventory, collections: [] } });
		expect(await screen.findByText("No collections yet")).toBeTruthy();
		expect(screen.getByRole("region", { name: "Largest" }).textContent).toContain("No data yet");
	});
});

describe("collection detail", () => {
	test("lists its volumes and erasure-coded volumes", async () => {
		renderApp("/collections/archive", { "GET /storage": busyInventory() });
		expect(await screen.findByRole("heading", { name: "archive" })).toBeTruthy();
		expect(screen.getByText("Erasure-coded volumes")).toBeTruthy();
		expect(screen.getByRole("link", { name: "20" })).toBeTruthy();
		expect(screen.getByRole("img", { name: "Share of the cluster's stored bytes" })).toBeTruthy();
	});

	test("shows how its volumes fill and where their copies live", async () => {
		renderApp("/collections/media", { "GET /storage": busyInventory() });
		const placement = await screen.findByRole("list", { name: "Volume copies by server" });
		expect(within(placement).getAllByRole("listitem").length).toBeGreaterThan(0);
		expect(screen.getByRole("img", { name: "This collection's volumes by fill level" })).toBeTruthy();
	});

	test("deleting needs the typed name, then returns to the list", async () => {
		const app = renderApp("/collections/media", {
			"GET /storage": busyInventory(),
			"DELETE /storage/collections/media": { ok: true },
		});
		fireEvent.click(await screen.findByRole("button", { name: "Delete collection" }));
		const dialog = await screen.findByRole("alertdialog");
		fireEvent.change(within(dialog).getByLabelText(/Type media to confirm/), { target: { value: "media" } });
		fireEvent.click(within(dialog).getByRole("button", { name: "Delete collection" }));
		expect(await screen.findByText("Collection media deleted")).toBeTruthy();
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/collections"));
	});

	test("grow volumes starts with this collection", async () => {
		renderApp("/collections/media", { "GET /storage": busyInventory() });
		fireEvent.click(await screen.findByRole("button", { name: "Grow volumes" }));
		expect(
			(within(await screen.findByRole("dialog")).getByLabelText("Collection") as HTMLInputElement).value,
		).toBe("media");
	});

	test("the default collection cannot be deleted", async () => {
		renderApp("/collections/(default)", { "GET /storage": busyInventory() });
		expect(await screen.findByText(/Data written without a collection lands here/)).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Delete collection" })).toBeNull();
	});

	test("viewers cannot delete", async () => {
		renderApp("/collections/media", { "GET /storage": busyInventory() }, viewerUser);
		await screen.findByRole("heading", { name: "media" });
		expect(screen.queryByRole("button", { name: "Delete collection" })).toBeNull();
	});

	test("unknown collections lead back", async () => {
		const app = renderApp("/collections/ghost", { "GET /storage": busyInventory() });
		expect(await screen.findByText("No collection named ghost")).toBeTruthy();
		fireEvent.click(screen.getByRole("link", { name: "All collections" }));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/collections"));
	});

	test("shows errors and retries", async () => {
		let fail = true;
		renderApp("/collections/media", {
			"GET /storage": () =>
				fail ? Response.json({ error: "down", upstream: "admin" }, { status: 502 }) : busyInventory(),
		});
		expect(await screen.findByText("SeaweedFS admin reported a problem")).toBeTruthy();
		fail = false;
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(await screen.findByRole("heading", { name: "media" })).toBeTruthy();
	});
});
