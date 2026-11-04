import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type Harness, harness } from "../../test/harness.ts";

let h: Harness;
beforeEach(async () => {
	h = await harness();
	h.admin.fixture("GET /api/admin", "admin/admin");
	h.admin.fixture("GET /api/cluster/masters", "admin/masters");
	h.admin.fixture("GET /api/cluster/volumes", "admin/volume-servers");
	h.admin.fixture("GET /api/cluster/topology", "admin/topology");
	h.admin.fixture("GET /api/config", "admin/config");
	h.master.fixture("GET /cluster/status", "master/cluster-status");
});
afterEach(() => h.stop());

describe("overview", () => {
	test("combines the admin dashboard with live cluster membership", async () => {
		const { status, body } = await h.json("GET", "/overview");
		expect(status).toBe(200);
		expect(body.totalVolumes).toBeGreaterThan(0);
		expect(body.filers).toEqual(h.grpc.nodes.filer);
		expect(body.s3Gateways).toEqual(h.grpc.nodes.s3);
		expect(body.volumeServers[0].address).toBe("127.0.0.1:18080");
	});

	test("falls back to the admin's node lists when gRPC is unavailable", async () => {
		h.grpc.failing = true;
		const { status, body } = await h.json("GET", "/overview");
		expect(status).toBe(200);
		expect(body.filers[0]).toMatchObject({
			address: "127.0.0.1:18888",
			version: expect.stringMatching(/^4\.52/),
		});
		expect(body.s3Gateways[0].address).toBe("127.0.0.1:28333");
	});
});

describe("cluster", () => {
	test("masters include raft roles and the master's leader view", async () => {
		const { body } = await h.json("GET", "/cluster/masters");
		expect(body).toEqual({
			masters: [{ address: "127.0.0.1:19333", isLeader: true, suffrage: "Voter" }],
			leader: "127.0.0.1:19333",
			maxVolumeId: 21,
		});
	});

	test("volume servers", async () => {
		const { body } = await h.json("GET", "/cluster/volume-servers");
		expect(body.volumeServers[0]).toMatchObject({ address: "127.0.0.1:18080", volumes: 14 });
	});

	test("volume servers carry the version the dashboard knows", async () => {
		const { body } = await h.json("GET", "/cluster/volume-servers");
		expect(body.volumeServers[0].version).toBe("4.52 984eac6a790be89e2a11de175a7413e1e3e32dd3");
	});

	test("filers, S3 gateways and brokers come from the master", async () => {
		expect((await h.json("GET", "/cluster/filers")).body).toEqual({ nodes: h.grpc.nodes.filer });
		expect((await h.json("GET", "/cluster/s3")).body).toEqual({ nodes: h.grpc.nodes.s3 });
		expect((await h.json("GET", "/cluster/brokers")).body).toEqual({ nodes: [] });
	});

	test("rejects unknown node types", async () => {
		expect((await h.get("/cluster/robots")).status).toBe(404);
	});

	test("mount clients are gathered from every filer's gRPC port", async () => {
		h.grpc.mounts = [
			{
				filer: "f",
				clientName: "mount@x",
				clientId: "1",
				clientType: "mount",
				path: "/",
				version: "",
				address: "x",
				connectedAt: null,
			},
		];
		const { body } = await h.json("GET", "/cluster/mount-clients");
		expect(body.clients).toEqual(h.grpc.mounts);
		expect(h.grpc.calls).toContain("mounts:127.0.0.1:28888");
	});

	test("topology", async () => {
		const { body } = await h.json("GET", "/cluster/topology");
		expect(body.dataCenters[0].racks[0].nodes[0].address).toBe("127.0.0.1:18080");
	});

	test("system configuration", async () => {
		const { body } = await h.json("GET", "/system/config");
		expect(body).toMatchObject({
			masterAddress: "127.0.0.1:19333",
			maintenanceEnabled: true,
			dataDir: "/tmp/kelp-sw/admin",
		});
		expect(body.kelp).toMatchObject({ version: expect.any(String), s3Endpoint: null });
	});
});
