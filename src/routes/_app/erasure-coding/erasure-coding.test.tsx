import { describe, expect, test } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderApp } from "../../../../test/render-app.tsx";
import { busyInventory, realInventory } from "../../../../test/storage-fixtures.ts";

describe("erasure coding page", () => {
	test("maps every shard and calls out damage", async () => {
		const app = renderApp("/erasure-coding", { "GET /storage": busyInventory() });
		expect(await screen.findByText("Extra copies")).toBeTruthy();
		expect(screen.getByText("2 missing")).toBeTruthy();
		expect(screen.getByText("Unreadable")).toBeTruthy();
		expect(screen.getByText("2 volumes need a rebuild")).toBeTruthy();
		expect(screen.getByText("1 more servers")).toBeTruthy();
		const legend = screen.getByRole("list", { name: "Servers" });
		expect(within(legend).getByText("Missing")).toBeTruthy();
		expect(within(legend).getByText("Parity")).toBeTruthy();
		expect(screen.getAllByRole("img", { name: "Shard 12: missing" }).length).toBeGreaterThan(0);
		expect(screen.getAllByRole("img", { name: "Shard 3: a:8080, d:8080" })).toHaveLength(1);

		fireEvent.click(screen.getByRole("link", { name: "21" }).closest("tr") as HTMLElement);
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/erasure-coding/21"));
	});

	test("sorts by health, searches, and retries after errors", async () => {
		let fail = true;
		renderApp("/erasure-coding", {
			"GET /storage": () =>
				fail ? Response.json({ error: "down", upstream: "admin" }, { status: 502 }) : busyInventory(),
		});
		expect(await screen.findByText("SeaweedFS admin reported a problem")).toBeTruthy();
		fail = false;
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		await screen.findByRole("link", { name: "21" });
		fireEvent.click(screen.getByText("Health"));
		fireEvent.change(screen.getByLabelText("Search EC volumes"), { target: { value: "cold" } });
		expect(screen.getByRole("link", { name: "22" })).toBeTruthy();
		expect(screen.queryByRole("link", { name: "21" })).toBeNull();
	});

	test("explains erasure coding when nothing is encoded", async () => {
		const inventory = await realInventory();
		renderApp("/erasure-coding", { "GET /storage": { ...inventory, ecVolumes: [] } });
		expect(await screen.findByText("No erasure-coded volumes")).toBeTruthy();
		expect(screen.getByText("Every volume is complete")).toBeTruthy();
	});
});

describe("EC volume detail", () => {
	test("a complete volume shows its full map and servers", async () => {
		renderApp("/erasure-coding/5", { "GET /storage": await realInventory() });
		expect(
			await screen.findByText("10 data shards and 4 parity shards. Hover a shard to see where it lives."),
		).toBeTruthy();
		expect(screen.getByText("0–13")).toBeTruthy();
		expect(screen.queryByRole("alert")).toBeNull();
		// The real export reports no file count for encoded volumes; Kelp says so instead of showing 0.
		expect(screen.getByText("SeaweedFS does not count files in encoded volumes")).toBeTruthy();
	});

	test("encoded volumes that do report files show the count", async () => {
		renderApp("/erasure-coding/21", { "GET /storage": busyInventory() });
		expect(await screen.findByText(/deleted$/)).toBeTruthy();
	});

	test("missing shards that can still be rebuilt", async () => {
		renderApp("/erasure-coding/21", { "GET /storage": busyInventory() });
		const alert = await screen.findByRole("alert");
		expect(within(alert).getByText("2 shards are missing")).toBeTruthy();
		expect(within(alert).getByText(/The volume is still readable/)).toBeTruthy();
	});

	test("too many missing shards", async () => {
		renderApp("/erasure-coding/22", { "GET /storage": busyInventory() });
		expect(await screen.findByText(/Too many shards are gone/)).toBeTruthy();
	});

	test("one missing shard reads in the singular", async () => {
		const inventory = busyInventory();
		const ec = inventory.ecVolumes.find((v) => v.id === 21);
		if (ec) ec.missingShards = [13];
		renderApp("/erasure-coding/21", { "GET /storage": inventory });
		expect(await screen.findByText("1 shard is missing")).toBeTruthy();
	});

	test("wider custom encodings skip the data/parity split", async () => {
		const inventory = busyInventory();
		const ec = inventory.ecVolumes.find((v) => v.id === 20);
		if (ec) Object.assign(ec, { dataShards: 0, parityShards: 0, totalShards: 14 });
		renderApp("/erasure-coding/20", { "GET /storage": inventory });
		expect(await screen.findByText("14 shards. Hover a shard to see where it lives.")).toBeTruthy();
		expect(screen.queryByText("Parity")).toBeNull();
	});

	test("plain volumes and unknown ids are explained", async () => {
		const app = renderApp("/erasure-coding/1", { "GET /storage": busyInventory() });
		expect(await screen.findByText("Volume 1 is not erasure coded")).toBeTruthy();
		fireEvent.click(screen.getByRole("link", { name: "View the volume" }));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/volumes/1"));
	});

	test("unknown ids lead back", async () => {
		const app = renderApp("/erasure-coding/999", { "GET /storage": busyInventory() });
		expect(await screen.findByText("Volume 999 is not in the cluster")).toBeTruthy();
		fireEvent.click(screen.getByRole("link", { name: "All EC volumes" }));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/erasure-coding"));
	});

	test("sorts servers by shard count, and retries after errors", async () => {
		let fail = true;
		renderApp("/erasure-coding/20", {
			"GET /storage": () =>
				fail ? Response.json({ error: "down", upstream: "admin" }, { status: 502 }) : busyInventory(),
		});
		expect(await screen.findByText("SeaweedFS admin reported a problem")).toBeTruthy();
		fail = false;
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		await screen.findByText("Shard map");
		fireEvent.click(screen.getAllByText("Shards").at(-1) as HTMLElement);
		expect(screen.getByText("0–6")).toBeTruthy();
	});
});
