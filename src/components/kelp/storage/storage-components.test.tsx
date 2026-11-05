import { describe, expect, test } from "bun:test";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { serverPalette, volumeHealth } from "@/lib/storage-queries.ts";
import { renderApp } from "../../../../test/render-app.tsx";
import { busyInventory } from "../../../../test/storage-fixtures.ts";
import { describeReplication } from "./cluster-actions.tsx";
import { ecHealth } from "./ec-volume-list.tsx";
import { serverFill, shardCells, shardRanges } from "./shard-map.tsx";
import { matchesFilter } from "./volume-table.tsx";

describe("links inside clickable rows", () => {
	test("volume, collection and EC links navigate on their own", async () => {
		const app = renderApp("/volumes", { "GET /storage": busyInventory() });
		fireEvent.click(await screen.findByRole("link", { name: "2" }));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/volumes/2"));
		expect(await screen.findByText(", 20 deleted", { exact: false })).toBeTruthy();

		await app.router.navigate({ to: "/collections" });
		fireEvent.click(await screen.findByRole("link", { name: "videos" }));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/collections/videos"));

		await app.router.navigate({ to: "/erasure-coding" });
		fireEvent.click(await screen.findByRole("link", { name: "22" }));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/erasure-coding/22"));
	});
});

describe("storage helpers", () => {
	test("describeReplication explains every digit", () => {
		expect(describeReplication("000")).toBe("1 copy, no replication.");
		expect(describeReplication("200")).toBe("3 copies: the original plus 2 in other data centers.");
		expect(describeReplication("120")).toBe(
			"4 copies: the original plus 1 in another data center, 2 on other racks.",
		);
		expect(describeReplication("002")).toBe(
			"3 copies: the original plus 2 on other servers in the same rack.",
		);
		expect(describeReplication("x")).toBe(
			"Three digits: copies in other data centers, other racks, other servers.",
		);
	});

	test("volume health puts missing copies first", () => {
		const [v] = busyInventory().volumes;
		if (!v) throw new Error("fixture");
		expect(volumeHealth({ ...v, replicas: [], readOnly: true })).toMatchObject({ tone: "bad" });
		expect(volumeHealth({ ...v, readOnly: true })).toEqual({ tone: "idle", label: "Read-only" });
		expect(volumeHealth({ ...v, garbageRatio: 0.5 })).toEqual({ tone: "warn", label: "Needs vacuum" });
		expect(volumeHealth(v)).toEqual({ tone: "good", label: "Writable" });
		expect(matchesFilter(v, "all")).toBe(true);
	});

	test("server colors are stable and fold past five", () => {
		const palette = serverPalette(["f", "b", "a", "e", "d", "c", "a"]);
		expect([...palette.keys()]).toEqual(["a", "b", "c", "d", "e", "f"]);
		expect(serverFill(palette, "a")).toBe("bg-data-1");
		expect(serverFill(palette, "f")).toBe("bg-[rgb(120_120_128/0.45)]");
		expect(serverFill(palette, "unknown")).toBe("bg-[rgb(120_120_128/0.45)]");
	});

	test("shard helpers", () => {
		expect(shardRanges([5, 0, 1, 2, 9, 10])).toBe("0–2, 5, 9–10");
		expect(shardRanges([])).toBe("");
		const ec = busyInventory().ecVolumes.find((v) => v.id === 20);
		if (!ec) throw new Error("fixture");
		expect(shardCells(ec)[3]?.holders.map((h) => h.server)).toEqual(["a:8080", "d:8080"]);
		expect(ecHealth(ec)).toEqual({ tone: "warn", label: "Extra copies" });
	});
});
