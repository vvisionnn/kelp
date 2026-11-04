import { describe, expect, test } from "bun:test";
import { mapMasters, mapOverview, mapVolumeServer } from "./cluster.ts";

const admin = await Bun.file(`${import.meta.dir}/../../fixtures/admin/admin.json`).json();
const masters = await Bun.file(`${import.meta.dir}/../../fixtures/admin/masters.json`).json();

describe("mapVolumeServer", () => {
	test("maps the upstream shape and treats the zero time as unknown", () => {
		const server = mapVolumeServer({ ...admin.volume_servers[0], last_heartbeat: "0001-01-01T00:00:00Z" });
		expect(server).toMatchObject({
			id: "127.0.0.1:18080",
			address: "127.0.0.1:18080",
			dataCenter: "DefaultDataCenter",
			rack: "DefaultRack",
			maxVolumes: 967,
			lastHeartbeat: null,
		});
		expect(server.diskCapacity).toBeGreaterThan(server.diskUsage);
	});

	test("falls back to the address when the id is empty", () => {
		expect(mapVolumeServer({ address: "a:1" }).id).toBe("a:1");
	});
});

describe("mapOverview", () => {
	const nodes = {
		filer: [{ address: "f:8888", version: "4.52", dataCenter: "", rack: "", createdAt: null }],
		s3: [],
		broker: [],
	};

	test("combines admin data with cluster node lists", () => {
		const overview = mapOverview(admin, nodes);
		expect(overview.totalVolumes).toBe(admin.total_volumes);
		expect(overview.totalFiles).toBe(admin.total_chunks);
		expect(overview.masters).toEqual([{ address: "127.0.0.1:19333", isLeader: true }]);
		expect(overview.filers).toEqual(nodes.filer);
		expect(overview.dataCenters[0]?.racks[0]?.nodes[0]?.address).toBe("127.0.0.1:18080");
		expect(overview.tiers[0]).toMatchObject({ name: "hdd", isRemote: false, maxVolumes: 967 });
		expect(overview.versions.uniform).toBe(true);
		expect(overview.versions.groups.map((g) => g.type)).toContain("Volume Servers");
		expect(overview.maintenance).toEqual({ workers: 0, tasks: 0 });
	});

	test("tolerates missing optional sections", () => {
		const overview = mapOverview(
			{ master_nodes: null, volume_servers: null },
			{ filer: [], s3: [], broker: [] },
		);
		expect(overview).toMatchObject({
			totalVolumes: 0,
			masters: [],
			volumeServers: [],
			dataCenters: [],
			tiers: [],
			versions: { uniform: true, version: "", groups: [] },
		});
	});
});

describe("mapMasters", () => {
	test("keeps raft suffrage", () => {
		expect(mapMasters(masters)).toEqual([{ address: "127.0.0.1:19333", isLeader: true, suffrage: "Voter" }]);
	});
});
