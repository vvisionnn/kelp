import { describe, expect, test } from "bun:test";
import type { Overview } from "@shared/api.ts";
import { fireEvent, screen, within } from "@testing-library/react";
import { clusterApi } from "../../../test/client-fixtures.ts";
import { renderApp } from "../../../test/render-app.tsx";
import { healthSummary } from "./index.tsx";

describe("overview page", () => {
	test("shows capacity, counts, servers and services", async () => {
		const { routes, overview } = await clusterApi();
		renderApp("/", routes);
		expect(await screen.findByText("Disk capacity")).toBeTruthy();
		expect(screen.getByText(/Healthy\. 1 volume server reporting/)).toBeTruthy();
		expect(screen.getAllByText("127.0.0.1:18080").length).toBeGreaterThan(0);
		expect(screen.getByText("Storage tiers")).toBeTruthy();
		expect(screen.getByText(/Every node runs SeaweedFS/)).toBeTruthy();
		expect(screen.getByText(new RegExp(`in ${overview.totalVolumes} volumes`))).toBeTruthy();
		const tile = within(screen.getByRole("main")).getByText("Volumes").parentElement?.parentElement;
		expect(tile?.textContent).toContain(String(overview.totalVolumes));
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
		expect(await screen.findByText("Disk capacity")).toBeTruthy();
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
