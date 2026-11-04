import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type Harness, harness } from "../../test/harness.ts";

let h: Harness;
beforeEach(async () => {
	h = await harness();
	h.admin.fixture("GET /api/volumes/export", "admin/volumes-export-ec");
});
afterEach(() => h.stop());

describe("storage inventory", () => {
	test("returns volumes, EC volumes, collections and disks", async () => {
		const { status, body } = await h.json("GET", "/storage");
		expect(status).toBe(200);
		expect(body.volumes).toHaveLength(5);
		expect(body.ecVolumes[0]).toMatchObject({ id: 5, collection: "logs" });
		expect(body.collections.map((c: { name: string }) => c.name)).toEqual(["backups", "logs", "media"]);
	});

	test("viewers can read it too", async () => {
		const viewer = await harness({ role: "viewer" });
		viewer.admin.fixture("GET /api/volumes/export", "admin/volumes-export-ec");
		expect((await viewer.get("/storage")).status).toBe(200);
		await viewer.stop();
	});
});

describe("volume actions", () => {
	test("vacuums one volume through the admin", async () => {
		h.admin.on("POST /api/volumes/3/127.0.0.1:8380/vacuum", { message: "ok" });
		const { status, body } = await h.json("POST", "/storage/volumes/3/vacuum", { server: "127.0.0.1:8380" });
		expect(status).toBe(200);
		expect(body).toEqual({ ok: true });
	});

	test("marks a replica read-only or writable", async () => {
		h.admin.on("POST /api/volumes/3/127.0.0.1:8380/read-only", { read_only: true });
		const { status } = await h.json("POST", "/storage/volumes/3/read-only", {
			server: "127.0.0.1:8380",
			readOnly: true,
		});
		expect(status).toBe(200);
		expect(JSON.parse(h.admin.last("POST", "/api/volumes/3/127.0.0.1:8380/read-only")?.body ?? "")).toEqual({
			read_only: true,
		});
	});

	test("rejects bad ids and missing servers", async () => {
		expect((await h.request("POST", "/storage/volumes/abc/vacuum", { server: "x" })).status).toBe(400);
		expect((await h.request("POST", "/storage/volumes/3/vacuum", {})).status).toBe(400);
		expect((await h.request("POST", "/storage/volumes/3/read-only", { server: "x" })).status).toBe(400);
	});

	test("passes SeaweedFS errors through", async () => {
		h.admin.on("POST /api/volumes/3/nope:1/read-only", () =>
			Response.json(
				{ error: "Failed to change volume access mode: volume 3 not found on server nope:1" },
				{ status: 500 },
			),
		);
		const { status, body } = await h.json("POST", "/storage/volumes/3/read-only", {
			server: "nope:1",
			readOnly: false,
		});
		expect(status).toBe(500);
		expect(body).toEqual({
			error: "Failed to change volume access mode: volume 3 not found on server nope:1",
			upstream: "admin",
		});
	});

	test("viewers cannot change anything", async () => {
		const viewer = await harness({ role: "viewer" });
		expect((await viewer.request("POST", "/storage/volumes/3/vacuum", { server: "x" })).status).toBe(403);
		await viewer.stop();
	});
});

describe("cluster actions", () => {
	test("vacuums the whole cluster with a garbage threshold", async () => {
		h.master.on("POST /vol/vacuum", { Topology: {} });
		const { status } = await h.json("POST", "/storage/vacuum", { garbageThreshold: 0.25 });
		expect(status).toBe(200);
		expect(h.master.last("POST", "/vol/vacuum")?.query).toEqual({ garbageThreshold: "0.25" });
	});

	test("thresholds must be between 0 and 1", async () => {
		expect((await h.request("POST", "/storage/vacuum", { garbageThreshold: 2 })).status).toBe(400);
	});

	test("grows volumes with only the options given", async () => {
		h.master.on("POST /vol/grow", { count: 2 });
		const { status, body } = await h.json("POST", "/storage/grow", {
			count: 2,
			collection: "media",
			replication: "001",
			diskType: "ssd",
			dataCenter: "",
		});
		expect(status).toBe(200);
		expect(body).toEqual({ count: 2 });
		expect(h.master.last("POST", "/vol/grow")?.query).toEqual({
			count: "2",
			collection: "media",
			replication: "001",
			disk: "ssd",
		});
	});

	test("explains when there is no room to grow", async () => {
		h.master.on("POST /vol/grow", () =>
			Response.json(
				{ error: "No matching data node found! \nDefaultDataCenter:Only has 0 racks" },
				{ status: 406 },
			),
		);
		const { status, body } = await h.json("POST", "/storage/grow", { count: 1, replication: "100" });
		expect(status).toBe(409);
		expect(body.error).toBe(
			"SeaweedFS could not place the new volumes: No matching data node found! DefaultDataCenter:Only has 0 racks",
		);
	});

	test("validates grow input", async () => {
		expect((await h.request("POST", "/storage/grow", { count: 0 })).status).toBe(400);
		expect((await h.request("POST", "/storage/grow", { count: 1, replication: "12" })).status).toBe(400);
		expect((await h.request("POST", "/storage/grow", { count: 1, ttl: "forever" })).status).toBe(400);
	});

	test("other grow failures pass through", async () => {
		h.master.on("POST /vol/grow", () => Response.json({ error: "boom" }, { status: 500 }));
		expect((await h.request("POST", "/storage/grow", { count: 1 })).status).toBe(500);
	});
});

describe("collections", () => {
	test("deletes a collection through the master", async () => {
		h.master.on("POST /col/delete", () => new Response(null, { status: 204 }));
		const response = await h.request("DELETE", "/storage/collections/media");
		expect(response.status).toBe(200);
		expect(h.master.last("POST", "/col/delete")?.query).toEqual({ collection: "media" });
	});

	test("unknown collections are a 404", async () => {
		h.master.on("POST /col/delete", () =>
			Response.json({ error: "collection nope does not exist" }, { status: 400 }),
		);
		const { status, body } = await h.json("DELETE", "/storage/collections/nope");
		expect(status).toBe(404);
		expect(body.error).toBe('Collection "nope" does not exist.');
	});

	test("other delete failures pass through", async () => {
		h.master.on("POST /col/delete", () => Response.json({ error: "volume server down" }, { status: 500 }));
		expect((await h.request("DELETE", "/storage/collections/media")).status).toBe(500);
	});
});
