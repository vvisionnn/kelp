import { describe, expect, test } from "bun:test";
import type { Overview } from "@shared/api.ts";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { clusterApi } from "../../../test/client-fixtures.ts";
import { renderApp } from "../../../test/render-app.tsx";
import { pickSegment } from "../../../test/segment.ts";
import { makeTelemetry } from "../../../test/telemetry-fixtures.ts";
import { healthSummary, sizeColumns } from "./index.tsx";

describe("overview page", () => {
	test("shows capacity, counts, servers and services", async () => {
		const { routes, overview } = await clusterApi();
		renderApp("/", routes);
		expect(await screen.findByText("Disk used")).toBeTruthy();
		expect(screen.getByText(/Healthy\. 1 volume server reporting/)).toBeTruthy();
		expect(screen.getAllByText("127.0.0.1:18080").length).toBeGreaterThan(0);
		expect(screen.getByText("Storage tiers")).toBeTruthy();
		expect(screen.getByText(/Every node runs SeaweedFS/)).toBeTruthy();
		const stored = screen.getByRole("region", { name: "Object data" });
		expect(stored.textContent).toContain(`${overview.totalVolumes} volumes`);
	});

	test("draws live traffic, latency, capacity and the busiest buckets from telemetry", async () => {
		const { routes } = await clusterApi();
		renderApp("/", routes);
		expect(await screen.findByRole("img", { name: "S3 requests per second by type" })).toBeTruthy();
		expect(screen.getByRole("img", { name: "S3 request latency percentiles" })).toBeTruthy();
		expect(screen.getByRole("img", { name: "Disk used" })).toBeTruthy();
		const buckets = screen.getByRole("list", { name: "Buckets by S3 requests" });
		expect(within(buckets).getByRole("link", { name: "photo-library" })).toBeTruthy();
		expect(within(buckets).getByText("2.4K")).toBeTruthy();
		expect(screen.getByText(/SeaweedFS processes use/)).toBeTruthy();
	});

	test("the time range control refetches every chart for the new range", async () => {
		const { routes } = await clusterApi();
		const app = renderApp("/", routes);
		const range = await screen.findByRole("radiogroup", { name: "Time range" });
		pickSegment(within(range).getByRole("radio", { name: "6h" }));
		await waitFor(() => expect(app.api.last("GET", "/telemetry")?.query.get("range")).toBe("6h"));
	});

	test("explains how to turn live charts on when metrics are off", async () => {
		const { routes } = await clusterApi();
		renderApp("/", {
			...routes,
			"GET /telemetry": {
				...makeTelemetry(),
				enabled: false,
				points: [],
				unreachable: ["http://seaweedfs:9327/metrics"],
			},
		});
		expect(await screen.findByText("Live charts are off")).toBeTruthy();
		expect(screen.getByText(/Unreachable: http:\/\/seaweedfs:9327\/metrics/)).toBeTruthy();
		expect(screen.queryByRole("radiogroup", { name: "Time range" })).toBeNull();
	});

	test("size columns turn a cumulative histogram into counts per bucket", () => {
		expect(
			sizeColumns([
				{ le: 1024, count: 2 },
				{ le: 1048576, count: 5 },
				{ le: Number.POSITIVE_INFINITY, count: 6 },
			]),
		).toEqual([
			{ label: "≤1KiB", value: 2 },
			{ label: "≤1MiB", value: 3 },
		]);
	});

	test("lists versions when nodes disagree", async () => {
		const { routes, overview } = await clusterApi();
		const mixed: Overview = {
			...overview,
			tiers: [],
			versions: {
				uniform: false,
				version: "",
				groups: [
					{
						type: "Volume Servers",
						total: 2,
						versions: [
							{ version: "4.52 x", count: 1 },
							{ version: "4.41 y", count: 1 },
						],
					},
				],
			},
		};
		renderApp("/", { ...routes, "GET /overview": mixed });
		expect(await screen.findByText("Mixed versions")).toBeTruthy();
		expect(screen.getByText("Volume Servers: 4.52 (1), 4.41 (1)")).toBeTruthy();
		expect(screen.queryByText("Storage tiers")).toBeNull();
	});

	test("explains upstream failures and retries", async () => {
		let fail = true;
		const { routes } = await clusterApi();
		renderApp("/", {
			...routes,
			"GET /overview": () =>
				fail
					? Response.json({ error: "admin is unreachable", upstream: "admin" }, { status: 502 })
					: routes["GET /overview"],
		});
		expect(await screen.findByText("SeaweedFS admin reported a problem")).toBeTruthy();
		fail = false;
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(await screen.findByText("Disk used")).toBeTruthy();
	});
});

describe("healthSummary", () => {
	const base = {
		masters: [{ address: "m", isLeader: true }],
		volumeServers: [{ diskUsage: 10, diskCapacity: 100 }],
		versions: { uniform: true },
	} as unknown as Overview;

	test("healthy cluster", () => {
		expect(healthSummary(base)).toEqual({ tone: "good", text: "Healthy. 1 volume server reporting." });
		const two = { ...base, volumeServers: [...base.volumeServers, ...base.volumeServers] };
		expect(healthSummary(two).text).toBe("Healthy. 2 volume servers reporting.");
	});

	test("problems, most serious first", () => {
		expect(healthSummary({ ...base, masters: [] }).tone).toBe("bad");
		expect(healthSummary({ ...base, volumeServers: [] }).text).toBe("No volume servers are reporting.");
		expect(
			healthSummary({ ...base, volumeServers: [{ diskUsage: 95, diskCapacity: 100 }] } as unknown as Overview)
				.text,
		).toBe("Disks are 95% full. Add capacity soon.");
		expect(healthSummary({ ...base, versions: { uniform: false } } as unknown as Overview).text).toBe(
			"Nodes run different SeaweedFS versions.",
		);
	});
});
