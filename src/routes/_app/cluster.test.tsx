import { describe, expect, spyOn, test } from "bun:test";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { clusterApi } from "../../../test/client-fixtures.ts";
import { renderApp } from "../../../test/render-app.tsx";
import { makeTelemetry } from "../../../test/telemetry-fixtures.ts";
import { cores } from "./cluster.tsx";

describe("nodes page", () => {
	test("charts requests, latency and process cost per component, and volume slots per server", async () => {
		const { routes } = await clusterApi();
		renderApp("/cluster", routes);
		expect(await screen.findByRole("img", { name: "Requests per second by component" })).toBeTruthy();
		expect(screen.getByRole("img", { name: "95th percentile latency by component" })).toBeTruthy();
		expect(screen.getByRole("img", { name: "CPU trend" })).toBeTruthy();
		expect(screen.getAllByText("Volume servers", { selector: "li" })).toHaveLength(2);
		expect(await screen.findByRole("list", { name: "Volume slots by server" })).toBeTruthy();
		expect(screen.getByRole("radiogroup", { name: "Time range" })).toBeTruthy();
	});

	test("without sampled metrics the live panels say how to turn them on", async () => {
		const { routes } = await clusterApi();
		renderApp("/cluster", {
			...routes,
			"GET /telemetry": { ...makeTelemetry(), enabled: false, points: [] },
		});
		expect((await screen.findAllByText(/Live traffic appears here/)).length).toBe(2);
		expect(screen.queryByRole("radiogroup", { name: "Time range" })).toBeNull();
	});

	test("shows the topology and masters with the leader", async () => {
		const { routes } = await clusterApi();
		renderApp("/cluster", routes);
		expect(await screen.findByText("Leader")).toBeTruthy();
		expect(screen.getByText(/Highest volume id 21/)).toBeTruthy();
		expect(screen.getByText("DefaultDataCenter")).toBeTruthy();
		expect(screen.getAllByRole("meter").length).toBeGreaterThan(0);
	});

	test("each tab lists its nodes and the tab lives in the URL", async () => {
		const { routes } = await clusterApi();
		const app = renderApp("/cluster?tab=volume-servers", routes);
		expect(await screen.findByLabelText("Search volume servers")).toBeTruthy();
		expect(screen.getAllByText("127.0.0.1:18080").length).toBeGreaterThan(0);

		// Switching tabs keeps the reader where they were: the router never scrolls the page back to the top.
		const scrolls = spyOn(window, "scrollTo");
		fireEvent.click(screen.getByRole("tab", { name: "Filers" }));
		await waitFor(() => expect(app.router.state.resolvedLocation?.search).toEqual({ tab: "filers" }));
		expect(scrolls).not.toHaveBeenCalled();
		scrolls.mockRestore();
		expect(await screen.findByText("127.0.0.1:18888")).toBeTruthy();

		fireEvent.click(screen.getByRole("tab", { name: "S3 gateways" }));
		expect(await screen.findByText("127.0.0.1:18333")).toBeTruthy();

		fireEvent.click(screen.getByRole("tab", { name: "Message brokers" }));
		expect(await screen.findByText("No message brokers running")).toBeTruthy();

		fireEvent.click(screen.getByRole("tab", { name: "Mounts" }));
		expect(await screen.findByText("No mounts connected")).toBeTruthy();
	});

	test("lists connected mounts and placed nodes", async () => {
		const { routes } = await clusterApi();
		renderApp("/cluster?tab=mounts", {
			...routes,
			"GET /cluster/mount-clients": {
				clients: [
					{
						filer: "127.0.0.1:18888",
						clientName: "mount@host",
						clientId: 7,
						clientType: "mount",
						path: "/buckets/media",
						version: "4.52",
						address: "",
						connectedAt: new Date().toISOString(),
					},
				],
			},
		});
		expect(await screen.findByText("mount@host")).toBeTruthy();
		expect(screen.getByText("/buckets/media")).toBeTruthy();
	});

	test("shows node placement and a missing version", async () => {
		const { routes } = await clusterApi();
		renderApp("/cluster?tab=filers", {
			...routes,
			"GET /cluster/filers": {
				nodes: [{ address: "f1:8888", version: "", dataCenter: "dc1", rack: "", createdAt: null }],
			},
		});
		expect(await screen.findByText("dc1 / any")).toBeTruthy();
		expect(screen.getByText("—")).toBeTruthy();
	});

	test("an empty masters list explains itself", async () => {
		const { routes } = await clusterApi();
		renderApp("/cluster", {
			...routes,
			"GET /cluster/masters": {
				masters: [{ address: "m2:9333", isLeader: false }],
				leader: "m1:9333",
				maxVolumeId: 0,
			},
		});
		expect(await screen.findByText("Follower")).toBeTruthy();
		expect(screen.getByText("—")).toBeTruthy();
	});

	test("every tab explains failures and retries", async () => {
		const { routes } = await clusterApi();
		const down = () => Response.json({ error: "master is unreachable", upstream: "master" }, { status: 502 });
		let failing = true;
		const flaky = (path: keyof typeof routes) => () => (failing ? down() : routes[path]);
		renderApp("/cluster", {
			...routes,
			"GET /cluster/topology": down,
			"GET /cluster/masters": flaky("GET /cluster/masters"),
			"GET /cluster/volume-servers": flaky("GET /cluster/volume-servers"),
			"GET /cluster/filers": flaky("GET /cluster/filers"),
			"GET /cluster/mount-clients": flaky("GET /cluster/mount-clients"),
		});
		for (const [tab, ready] of [
			["Masters", "Leader"],
			["Volume servers", "Search volume servers"],
			["Filers", "127.0.0.1:18888"],
			["Mounts", "No mounts connected"],
		] as const) {
			failing = true;
			fireEvent.click(await screen.findByRole("tab", { name: tab }));
			fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
			failing = false;
			fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
			await waitFor(() =>
				expect(
					screen.queryAllByText(ready).length + screen.queryAllByLabelText(ready).length,
				).toBeGreaterThan(0),
			);
		}
		expect(screen.queryByText("DefaultDataCenter")).toBeNull();
	});

	test("volume servers and mounts can be searched and sorted", async () => {
		const { routes } = await clusterApi();
		renderApp("/cluster?tab=volume-servers", routes);
		fireEvent.change(await screen.findByLabelText("Search volume servers"), { target: { value: "nowhere" } });
		expect(screen.getByText('Nothing matches "nowhere".')).toBeTruthy();
		fireEvent.change(screen.getByLabelText("Search volume servers"), { target: { value: "18080" } });
		fireEvent.click(screen.getByText("Disk"));
		expect(screen.getAllByText("127.0.0.1:18080").length).toBeGreaterThan(0);
	});

	test("mounts can be searched", async () => {
		const { routes } = await clusterApi();
		renderApp("/cluster?tab=mounts", {
			...routes,
			"GET /cluster/mount-clients": {
				clients: [
					{
						filer: "f:8888",
						clientName: "m",
						clientId: 1,
						clientType: "mount",
						path: "/data",
						version: "",
						address: "10.0.0.5:1234",
						connectedAt: null,
					},
				],
			},
		});
		fireEvent.change(await screen.findByLabelText("Search mounts"), { target: { value: "/data" } });
		expect(screen.getByText("10.0.0.5:1234")).toBeTruthy();
	});
});

describe("cores", () => {
	test("CPU summed over processes reads as cores in use", () => {
		expect(cores(166)).toBe("1.66 cores");
		expect(cores(100)).toBe("1.00 core");
		expect(cores(1250)).toBe("12.5 cores");
	});
});
