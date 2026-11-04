import { describe, expect, test } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderApp, viewerUser } from "../../../../test/render-app.tsx";
import { busyInventory, realInventory } from "../../../../test/storage-fixtures.ts";
import { volumesSummary } from "./index.tsx";

const ok = { ok: true };

function rowFor(id: number) {
	const link = screen.getByRole("link", { name: String(id) });
	return link.closest("tr") as HTMLElement;
}

describe("volumes page", () => {
	test("sizes up the fleet and lists every volume", async () => {
		const inventory = await realInventory();
		renderApp("/volumes", { "GET /storage": inventory });
		expect(await screen.findByText(/5 volumes on 1 server\. Each grows to 256 MiB/)).toBeTruthy();
		expect(screen.getByText("Reclaimable")).toBeTruthy();
		for (const v of inventory.volumes) expect(screen.getByRole("link", { name: String(v.id) })).toBeTruthy();
	});

	test("filters by health, from the toolbar or the URL", async () => {
		const app = renderApp("/volumes?filter=attention", { "GET /storage": busyInventory() });
		await screen.findByRole("link", { name: "2" });
		expect(screen.queryByRole("link", { name: "6" })).toBeNull();
		expect(within(rowFor(4)).getByText("1 of 2 copies")).toBeTruthy();
		expect(within(rowFor(3)).getByText("Read-only")).toBeTruthy();
		expect(within(rowFor(2)).getByText("Needs vacuum")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Needs vacuum" }));
		expect(screen.queryByRole("link", { name: "3" })).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Read-only" }));
		expect(screen.getByRole("link", { name: "3" })).toBeTruthy();
		expect(screen.queryByRole("link", { name: "2" })).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "All" }));
		expect(screen.getByRole("link", { name: "6" })).toBeTruthy();

		fireEvent.click(rowFor(6));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/volumes/6"));
	});

	test("explains an empty filter", async () => {
		const inventory = await realInventory();
		renderApp("/volumes?filter=read-only", { "GET /storage": inventory });
		expect(await screen.findByText('No volume matches "Read-only".')).toBeTruthy();
	});

	test("row menu vacuums and toggles writes on every copy", async () => {
		const app = renderApp("/volumes", {
			"GET /storage": busyInventory(),
			"POST /storage/volumes/1/vacuum": ok,
			"POST /storage/volumes/1/read-only": ok,
			"POST /storage/volumes/3/read-only": ok,
		});
		fireEvent.click(await screen.findByRole("button", { name: "Actions for volume 1" }));
		fireEvent.click(await screen.findByRole("menuitem", { name: "Vacuum volume" }));
		expect(await screen.findByText("Volume 1 vacuumed")).toBeTruthy();
		expect(app.api.last("POST", "/storage/volumes/1/vacuum")?.body).toEqual({ server: "a:8080" });

		fireEvent.click(screen.getByRole("button", { name: "Actions for volume 1" }));
		fireEvent.click(await screen.findByRole("menuitem", { name: "Make read-only" }));
		expect(await screen.findByText("Volume 1 is now read-only")).toBeTruthy();
		const calls = app.api.calls.filter((c) => c.path === "/storage/volumes/1/read-only").map((c) => c.body);
		expect(calls).toEqual([
			{ server: "a:8080", readOnly: true },
			{ server: "b:8080", readOnly: true },
		]);

		fireEvent.click(screen.getByRole("button", { name: "Actions for volume 3" }));
		fireEvent.click(await screen.findByRole("menuitem", { name: "Make writable" }));
		expect(await screen.findByText("Volume 3 is now writable")).toBeTruthy();
	});

	test("bulk actions apply to the selection", async () => {
		const routes = {
			"GET /storage": await realInventory(),
			"POST /storage/volumes/1/vacuum": ok,
			"POST /storage/volumes/2/vacuum": ok,
			"POST /storage/volumes/3/vacuum": ok,
			"POST /storage/volumes/4/vacuum": ok,
			"POST /storage/volumes/6/vacuum": ok,
		} as Record<string, unknown>;
		for (const id of [1, 2, 3, 4, 6]) routes[`POST /storage/volumes/${id}/read-only`] = ok;
		const app = renderApp("/volumes", routes);
		await screen.findByRole("link", { name: "1" });
		fireEvent.click(screen.getByRole("checkbox", { name: "Select all rows" }));
		fireEvent.click(screen.getByRole("button", { name: "Vacuum" }));
		expect(await screen.findByText("5 volumes vacuumed")).toBeTruthy();

		fireEvent.click(screen.getByRole("checkbox", { name: "Select all rows" }));
		fireEvent.click(screen.getByRole("button", { name: "Make read-only" }));
		expect(await screen.findByText("5 volumes are now read-only")).toBeTruthy();

		fireEvent.click(screen.getByRole("checkbox", { name: "Select all rows" }));
		fireEvent.click(screen.getByRole("button", { name: "Make writable" }));
		expect(await screen.findByText("5 volumes are now writable")).toBeTruthy();
		expect(app.api.calls.filter((c) => c.path.endsWith("/read-only"))).toHaveLength(10);
	});

	test("vacuum cluster previews what qualifies at each threshold", async () => {
		const app = renderApp("/volumes", { "GET /storage": busyInventory(), "POST /storage/vacuum": ok });
		fireEvent.click(await screen.findByRole("button", { name: "Vacuum cluster" }));
		const dialog = await screen.findByRole("dialog");
		expect(within(dialog).getByText("1 volume qualify, about 5 MiB to reclaim.")).toBeTruthy();
		fireEvent.click(within(dialog).getByRole("button", { name: "50%" }));
		expect(within(dialog).getByText("1 volume qualify, about 5 MiB to reclaim.")).toBeTruthy();
		fireEvent.click(within(dialog).getByRole("button", { name: "1%" }));
		fireEvent.click(within(dialog).getByRole("button", { name: "Vacuum cluster" }));
		expect(await screen.findByText("Cluster vacuumed")).toBeTruthy();
		expect(app.api.last("POST", "/storage/vacuum")?.body).toEqual({ garbageThreshold: 0.01 });
	});

	test("vacuum cluster says when nothing qualifies", async () => {
		renderApp("/volumes", { "GET /storage": await realInventory() });
		fireEvent.click(await screen.findByRole("button", { name: "Vacuum cluster" }));
		expect(await screen.findByText("No volume is over this threshold right now.")).toBeTruthy();
	});

	test("grow volumes validates, then sends only what was filled in", async () => {
		const app = renderApp("/volumes", {
			"GET /storage": busyInventory(),
			"POST /storage/grow": { count: 3 },
		});
		fireEvent.click(await screen.findByRole("button", { name: "Grow volumes" }));
		const dialog = await screen.findByRole("dialog");
		fireEvent.change(within(dialog).getByLabelText("Volumes"), { target: { value: "0" } });
		fireEvent.change(within(dialog).getByLabelText("Replication"), { target: { value: "12" } });
		fireEvent.change(within(dialog).getByLabelText("Time to live"), { target: { value: "forever" } });
		expect(within(dialog).getByText("Choose between 1 and 100 volumes.")).toBeTruthy();
		expect(within(dialog).getByText("Use three digits, like 001.")).toBeTruthy();
		expect(within(dialog).getByText("Use a number and a unit: m, h, d, w, M or y.")).toBeTruthy();
		fireEvent.click(within(dialog).getByRole("button", { name: "Grow volumes" }));
		expect(app.api.last("POST", "/storage/grow")).toBeUndefined();

		fireEvent.change(within(dialog).getByLabelText("Volumes"), { target: { value: "3" } });
		fireEvent.change(within(dialog).getByLabelText("Replication"), { target: { value: "011" } });
		expect(
			within(dialog).getByText(
				"3 copies: the original plus 1 on another rack, 1 on another server in the same rack.",
			),
		).toBeTruthy();
		fireEvent.change(within(dialog).getByLabelText("Time to live"), { target: { value: "7d" } });
		fireEvent.change(within(dialog).getByLabelText("Collection"), { target: { value: " media " } });
		fireEvent.change(within(dialog).getByLabelText("Disk type"), { target: { value: "ssd" } });
		fireEvent.change(within(dialog).getByLabelText("Data center"), { target: { value: "dc1" } });
		fireEvent.change(within(dialog).getByLabelText("Rack"), { target: { value: "r1" } });
		fireEvent.click(within(dialog).getByRole("button", { name: "Grow volumes" }));
		expect(await screen.findByText("3 volumes added")).toBeTruthy();
		expect(app.api.last("POST", "/storage/grow")?.body).toEqual({
			count: 3,
			collection: "media",
			replication: "011",
			ttl: "7d",
			diskType: "ssd",
			dataCenter: "dc1",
			rack: "r1",
		});
	});

	test("grow failures keep the dialog open", async () => {
		renderApp("/volumes", {
			"GET /storage": await realInventory(),
			"POST /storage/grow": () =>
				Response.json(
					{ error: "SeaweedFS could not place the new volumes: Not enough data nodes found!" },
					{ status: 409 },
				),
		});
		fireEvent.click(await screen.findByRole("button", { name: "Grow volumes" }));
		const dialog = await screen.findByRole("dialog");
		fireEvent.click(within(dialog).getByRole("button", { name: "Grow volumes" }));
		expect(
			await screen.findByText("SeaweedFS could not place the new volumes: Not enough data nodes found!"),
		).toBeTruthy();
		expect(screen.getByRole("dialog")).toBeTruthy();
	});

	test("viewers see the data without write controls", async () => {
		renderApp("/volumes", { "GET /storage": busyInventory() }, viewerUser);
		await screen.findByRole("link", { name: "1" });
		expect(screen.queryByRole("button", { name: "Grow volumes" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Actions for volume 1" })).toBeNull();
		expect(screen.queryByRole("checkbox", { name: "Select all rows" })).toBeNull();
	});

	test("sorts by copies and status, and searches by server", async () => {
		renderApp("/volumes", { "GET /storage": busyInventory() });
		await screen.findByRole("link", { name: "1" });
		fireEvent.click(screen.getByText("Copies"));
		fireEvent.click(screen.getByText("Status"));
		fireEvent.change(screen.getByLabelText("Search volumes"), { target: { value: "ssd-f" } });
		expect(screen.getByRole("link", { name: "9" })).toBeTruthy();
		expect(screen.queryByRole("link", { name: "1" })).toBeNull();
	});

	test("shows upstream errors and retries", async () => {
		let fail = true;
		const inventory = await realInventory();
		renderApp("/volumes", {
			"GET /storage": () =>
				fail
					? Response.json({ error: "admin is unreachable", upstream: "admin" }, { status: 502 })
					: inventory,
		});
		expect(await screen.findByText("SeaweedFS admin reported a problem")).toBeTruthy();
		fail = false;
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(await screen.findByRole("link", { name: "1" })).toBeTruthy();
	});

	test("an empty cluster invites growing volumes", async () => {
		const inventory = await realInventory();
		renderApp("/volumes", { "GET /storage": { ...inventory, volumes: [] } });
		expect(await screen.findByText("No volumes yet")).toBeTruthy();
	});
});

test("volumesSummary handles singular and empty fleets", async () => {
	const inventory = await realInventory();
	expect(volumesSummary({ ...inventory, volumes: [] })).toBe(
		"No volumes yet. SeaweedFS creates them as data arrives.",
	);
	expect(volumesSummary({ ...inventory, volumes: inventory.volumes.slice(0, 1) })).toMatch(
		/^1 volume on 1 server\./,
	);
	expect(volumesSummary(busyInventory())).toMatch(/^9 volumes on 6 servers\./);
});
