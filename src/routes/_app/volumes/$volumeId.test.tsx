import { describe, expect, test } from "bun:test";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderApp, viewerUser } from "../../../../test/render-app.tsx";
import { busyInventory } from "../../../../test/storage-fixtures.ts";

const ok = { ok: true };

describe("volume detail", () => {
	test("shows size, copies across servers and the facts that matter", async () => {
		renderApp("/volumes/1", { "GET /storage": busyInventory() });
		expect(await screen.findByRole("heading", { name: "Volume 1" })).toBeTruthy();
		// Each copy appears in the size comparison and in the copies table.
		expect(screen.getAllByText("a:8080")).toHaveLength(2);
		expect(screen.getAllByText("b:8080")).toHaveLength(2);
		expect(screen.getByRole("list", { name: "Size of each copy" })).toBeTruthy();
		expect(screen.getByText("Size rank").nextSibling?.textContent).toMatch(/^#\d+ of \d+$/);
		expect(
			screen.getByText("2 copies: the original plus 1 on another server in the same rack."),
		).toBeTruthy();
		expect(screen.getByText("Keep forever")).toBeTruthy();
		expect(screen.getByRole("link", { name: "media" }).getAttribute("href")).toBe("/collections/media");
	});

	test("the default collection links to its sentinel path", async () => {
		renderApp("/volumes/5", { "GET /storage": busyInventory() });
		expect((await screen.findByRole("link", { name: "Default" })).getAttribute("href")).toBe(
			"/collections/(default)",
		);
	});

	test("vacuums, freezes and unfreezes the volume", async () => {
		const app = renderApp("/volumes/1", {
			"GET /storage": busyInventory(),
			"POST /storage/volumes/1/vacuum": ok,
			"POST /storage/volumes/1/read-only": ok,
		});
		fireEvent.click(await screen.findByRole("button", { name: "Vacuum volume" }));
		expect(await screen.findByText("Volume 1 vacuumed")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Make read-only" }));
		expect(await screen.findByText("Volume 1 is now read-only")).toBeTruthy();

		fireEvent.click(screen.getByRole("switch", { name: "Accept writes on b:8080" }));
		await waitFor(() =>
			expect(app.api.last("POST", "/storage/volumes/1/read-only")?.body).toEqual({
				server: "b:8080",
				readOnly: true,
			}),
		);
		await waitFor(() => expect(screen.getAllByText("Volume 1 is now read-only")).toHaveLength(2));
	});

	test("read-only volumes offer to become writable", async () => {
		const app = renderApp("/volumes/3", {
			"GET /storage": busyInventory(),
			"POST /storage/volumes/3/read-only": ok,
		});
		fireEvent.click(await screen.findByRole("button", { name: "Make writable" }));
		expect(await screen.findByText("Volume 3 is now writable")).toBeTruthy();
		expect(app.api.last("POST", "/storage/volumes/3/read-only")?.body).toEqual({
			server: "a:8080",
			readOnly: false,
		});
	});

	test("viewers see writes as status, not switches", async () => {
		renderApp("/volumes/3", { "GET /storage": busyInventory() }, viewerUser);
		await screen.findByRole("heading", { name: "Volume 3" });
		// The page status and the copy's status both say so.
		expect(screen.getAllByText("Read-only").length).toBeGreaterThanOrEqual(2);
		expect(screen.queryByRole("switch")).toBeNull();
		expect(screen.queryByRole("button", { name: "Vacuum volume" })).toBeNull();
	});

	test("points erasure-coded volumes to their shards", async () => {
		const app = renderApp("/volumes/20", { "GET /storage": busyInventory() });
		expect(await screen.findByText("Volume 20 is erasure coded")).toBeTruthy();
		fireEvent.click(screen.getByRole("link", { name: "View its shards" }));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/erasure-coding/20"));
	});

	test("unknown volumes lead back to the list", async () => {
		const app = renderApp("/volumes/404", { "GET /storage": busyInventory() });
		expect(await screen.findByText("Volume 404 is not in the cluster")).toBeTruthy();
		fireEvent.click(screen.getByRole("link", { name: "All volumes" }));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/volumes"));
	});

	test("shows errors and retries", async () => {
		let fail = true;
		renderApp("/volumes/1", {
			"GET /storage": () =>
				fail
					? Response.json({ error: "admin is unreachable", upstream: "admin" }, { status: 502 })
					: busyInventory(),
		});
		expect(await screen.findByText("SeaweedFS admin reported a problem")).toBeTruthy();
		fail = false;
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(await screen.findByRole("heading", { name: "Volume 1" })).toBeTruthy();
	});
});
