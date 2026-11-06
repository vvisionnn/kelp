import { describe, expect, test } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { clusterApi } from "../../../test/client-fixtures.ts";
import { renderApp } from "../../../test/render-app.tsx";
import { busyInventory, realInventory } from "../../../test/storage-fixtures.ts";
import { makeTelemetry } from "../../../test/telemetry-fixtures.ts";

/** A response that stays pending until released, so the loading state can be seen. */
function held<T>(value: T) {
	let release: () => void = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	return {
		respond: async () => {
			await gate;
			return value;
		},
		release: () => release(),
	};
}

const down = () => Response.json({ error: "down", upstream: "admin" }, { status: 502 });

describe("storage loading states", () => {
	test("each page stands its real structure up around ghosts, then lands its data", async () => {
		const pages: Array<[string, string, string[], string]> = [
			["/volumes", "Loading storage", ["Volumes", "Volume server traffic", "Most garbage"], "Search volumes"],
			[
				"/collections",
				"Loading storage",
				["Collections", "Stored bytes", "Object size"],
				"Search collections",
			],
			[
				"/erasure-coding",
				"Loading storage",
				["Erasure coding", "Shards per server", "How it works"],
				"Search EC volumes",
			],
			["/volumes/1", "Loading", ["Volume 1", "Fill", "Details", "In the fleet", "Copies"], "Size rank"],
			["/collections/media", "Loading", ["media", "Share of the cluster", "Placement"], "Reclaimable"],
			["/erasure-coding/20", "Loading", ["Volume 20", "Shard map", "Servers"], "Shards present"],
		];
		for (const [path, label, headings, ready] of pages) {
			const response = held(busyInventory());
			const view = renderApp(path, { "GET /storage": response.respond, "GET /telemetry": makeTelemetry() });
			// Plain selectors: a role query over a whole page takes longer than a findBy waits.
			const region = () => document.querySelector(`[role="status"][aria-label="${label}"]`);
			await waitFor(() => expect(Boolean(region()?.querySelector(".tide"))).toBe(true));
			for (const name of headings) expect(screen.getByText(name, { selector: "h1,h2,h3" })).toBeTruthy();
			// Placeholders are drawn, never reachable: nothing can be typed into a table that is about to go.
			expect(Boolean(region()?.querySelector('input[aria-label^="Search"]'))).toBe(false);
			response.release();
			await waitFor(() =>
				expect(
					screen.queryAllByText(ready).length + screen.queryAllByLabelText(ready).length,
				).toBeGreaterThan(0),
			);
			await waitFor(() => expect(region() === null).toBe(true));
			view.unmount();
		}
	});

	test("telemetry still loading never reads as metrics being off", async () => {
		const telemetry = held(makeTelemetry());
		renderApp("/volumes", { "GET /storage": busyInventory(), "GET /telemetry": telemetry.respond });
		await screen.findByRole("status", { name: "Loading storage" });
		await waitFor(() => expect(screen.getByText(/9 volumes on 6 servers/)).toBeTruthy());
		expect(screen.queryByText(/Live traffic appears here/)).toBeNull();
		expect(screen.queryByText("Metrics are off")).toBeNull();
		telemetry.release();
		expect(
			await screen.findByRole("img", { name: "Volume server reads and writes per second" }),
		).toBeTruthy();
		expect(screen.getByRole("radiogroup", { name: "Time range" })).toBeTruthy();
	});

	test("failed telemetry never holds a page back", async () => {
		renderApp("/collections", { "GET /storage": busyInventory(), "GET /telemetry": down });
		expect(await screen.findByLabelText("Search collections")).toBeTruthy();
		expect(screen.queryByRole("radiogroup", { name: "Time range" })).toBeNull();
	});

	test("a failed refresh keeps the data on screen", async () => {
		let fail = false;
		const app = renderApp("/volumes", {
			"GET /storage": () => (fail ? down() : busyInventory()),
			"GET /telemetry": makeTelemetry(),
		});
		await screen.findByRole("link", { name: "2" });
		fail = true;
		await app.queryClient.refetchQueries({ queryKey: ["storage"] });
		expect(screen.getByRole("link", { name: "2" })).toBeTruthy();
		expect(screen.queryByRole("alert")).toBeNull();
	});

	test("a failed refresh leaves a node tab and the topology in place", async () => {
		const { routes } = await clusterApi();
		let fail = false;
		const app = renderApp("/cluster?tab=volume-servers", {
			...routes,
			"GET /cluster/topology": () => (fail ? down() : routes["GET /cluster/topology"]),
			"GET /cluster/volume-servers": () => (fail ? down() : routes["GET /cluster/volume-servers"]),
		});
		await screen.findByLabelText("Search volume servers");
		await screen.findByText("DefaultDataCenter");
		fail = true;
		await app.queryClient.refetchQueries({ queryKey: ["cluster"] });
		expect(screen.getByLabelText("Search volume servers")).toBeTruthy();
		expect(screen.getByText("DefaultDataCenter")).toBeTruthy();
		expect(screen.queryByRole("alert")).toBeNull();
	});

	test("a node tab and the topology each stand up their own ghost", async () => {
		const { routes } = await clusterApi();
		const masters = held(routes["GET /cluster/masters"]);
		const topology = held(routes["GET /cluster/topology"]);
		renderApp("/cluster", {
			...routes,
			"GET /cluster/masters": masters.respond,
			"GET /cluster/topology": topology.respond,
		});
		expect(await screen.findByRole("status", { name: "Loading masters" })).toBeTruthy();
		expect(screen.getByRole("status", { name: "Loading topology" })).toBeTruthy();
		expect(screen.getByRole("heading", { name: "Topology" })).toBeTruthy();
		masters.release();
		topology.release();
		expect(await screen.findByText(/Highest volume id 21/)).toBeTruthy();
		expect(await screen.findByText("DefaultDataCenter")).toBeTruthy();
	});

	test("a topology that cannot load says so without offering a second retry", async () => {
		const { routes } = await clusterApi();
		renderApp("/cluster", { ...routes, "GET /cluster/topology": down });
		const alert = await screen.findByRole("alert");
		expect(within(alert).getByText("SeaweedFS admin reported a problem")).toBeTruthy();
		expect(within(alert).queryByRole("button")).toBeNull();
	});

	test("dialogs opened before the inventory wait instead of claiming nothing qualifies", async () => {
		const response = held(await realInventory());
		renderApp("/volumes", { "GET /storage": response.respond, "GET /telemetry": makeTelemetry() });
		fireEvent.click(await screen.findByRole("button", { name: "Vacuum cluster" }));
		const vacuum = await screen.findByRole("dialog");
		expect(within(vacuum).queryByText("No volume is over this threshold right now.")).toBeNull();
		expect(vacuum.querySelector(".tide")).toBeTruthy();
		response.release();
		expect(await within(vacuum).findByText("No volume is over this threshold right now.")).toBeTruthy();
	});

	test("the grow dialog leaves the volume size out until it is known", async () => {
		const response = held(await realInventory());
		renderApp("/volumes", { "GET /storage": response.respond, "GET /telemetry": makeTelemetry() });
		fireEvent.click(await screen.findByRole("button", { name: "Grow volumes" }));
		const grow = await screen.findByRole("dialog");
		expect(within(grow).queryByText(/Each holds up to/)).toBeNull();
		response.release();
		expect(await within(grow).findByText(/Each holds up to 256 MiB/)).toBeTruthy();
	});

	test("a volume disappearing mid-view turns into its explanation under the same title", async () => {
		const inventory = busyInventory();
		let gone = false;
		const app = renderApp("/volumes/1", {
			"GET /storage": () =>
				gone ? { ...inventory, volumes: inventory.volumes.filter((v) => v.id !== 1) } : inventory,
		});
		await screen.findByText("Size rank");
		gone = true;
		await app.queryClient.refetchQueries({ queryKey: ["storage"] });
		expect(await screen.findByText("Volume 1 is not in the cluster")).toBeTruthy();
		expect(screen.getByRole("heading", { name: "Volume 1" })).toBeTruthy();
		await waitFor(() => expect(screen.queryByRole("button", { name: "Vacuum volume" })).toBeNull());
	});
});
