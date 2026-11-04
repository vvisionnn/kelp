import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type Harness, harness } from "../../test/harness.ts";

let h: Harness;
const BROKER = { address: "127.0.0.1:17777", version: "4.52", dataCenter: "", rack: "", createdAt: null };

beforeEach(async () => {
	h = await harness();
	h.grpc.nodes.broker = [BROKER];
	h.grpc.brokerLeader = "127.0.0.1:17777";
	h.grpc.topics = [
		{ namespace: "orders", name: "created" },
		{ namespace: "telemetry", name: "cpu" },
	];
	h.admin.fixture("GET /api/mq/topics/orders/created", "mq/topic-orders-created");
	h.admin.fixture("GET /api/mq/topics/telemetry/cpu", "mq/topic-telemetry-cpu");
});
afterEach(() => h.stop());

describe("messaging overview", () => {
	test("lists brokers, the leader and every topic with its details", async () => {
		const { status, body } = await h.json("GET", "/messaging");
		expect(status).toBe(200);
		expect(body.brokers).toEqual([BROKER]);
		expect(body.leader).toBe("127.0.0.1:17777");
		expect(body.topics).toHaveLength(2);
		expect(body.topics[0]).toMatchObject({
			namespace: "orders",
			name: "created",
			partitionCount: 4,
			retention: { enabled: true, seconds: 604800 },
		});
		expect(body.topics[1].retention).toEqual({ enabled: true, seconds: 3600 });
		expect(h.grpc.calls).toContain("topics:127.0.0.1:17777");
	});

	test("is empty without brokers", async () => {
		h.grpc.nodes.broker = [];
		const { body } = await h.json("GET", "/messaging");
		expect(body).toEqual({ brokers: [], leader: null, topics: [] });
	});

	test("asks any broker while the leader is still being elected", async () => {
		h.grpc.brokerLeader = null;
		const { body } = await h.json("GET", "/messaging");
		expect(body.leader).toBeNull();
		expect(body.topics).toHaveLength(2);
	});

	test("keeps topics whose details fail, with the reason", async () => {
		h.grpc.topics.push({ namespace: "ghost", name: "gone" });
		h.admin.on("GET /api/mq/topics/ghost/gone", () => Response.json({ error: "boom" }, { status: 500 }));
		const { body } = await h.json("GET", "/messaging");
		expect(body.topics[2]).toMatchObject({ namespace: "ghost", name: "gone", detailError: "boom" });
	});
});

describe("topic detail", () => {
	test("maps partitions onto ring ranges", async () => {
		const { body } = await h.json("GET", "/messaging/topics/orders/created");
		expect(
			body.partitions.map((p: { rangeStart: number; rangeStop: number }) => [p.rangeStart, p.rangeStop]),
		).toEqual([
			[0, 630],
			[630, 1260],
			[1260, 1890],
			[1890, 2520],
		]);
		expect(body.partitions[0].lastDataAt).toBeNull();
		expect(body.keySchema).toEqual([]);
		expect(body.consumerGroupOffsets).toEqual([]);
	});

	test("maps publishers, subscribers, schema and offsets", async () => {
		h.admin.on("GET /api/mq/topics/orders/created", {
			namespace: "orders",
			name: "created",
			partitions: [{ id: 0, leader_broker: "b:1", message_count: 5, total_size: 50 }],
			key_schema: [{ name: "id", type: "INT64", required: true }],
			value_schema: [{ name: "body", type: "BYTES" }],
			publishers: [
				{
					publisher_name: "api",
					client_id: "c1",
					partition_id: 0,
					broker: "b:1",
					connect_time: "2026-11-04T10:00:00Z",
					last_seen_time: "2026-11-04T10:05:00Z",
					is_active: true,
					last_published_offset: 9,
					last_acked_offset: 8,
				},
			],
			subscribers: [
				{
					consumer_group: "billing",
					consumer_id: "w1",
					client_id: "c2",
					partition_id: 0,
					broker: "b:1",
					is_active: false,
					current_offset: 4,
					last_received_offset: 5,
				},
			],
			consumer_group_offsets: [
				{ consumer_group: "billing", partition_id: 0, offset: 4, last_updated: "2026-11-04T10:05:00Z" },
			],
			retention: { enabled: true, retention_seconds: 3600 },
		});
		const { body } = await h.json("GET", "/messaging/topics/orders/created");
		expect(body.keySchema).toEqual([{ name: "id", type: "INT64", required: true }]);
		expect(body.valueSchema[0].required).toBe(false);
		expect(body.publishers[0]).toMatchObject({ name: "api", active: true, lastPublishedOffset: 9 });
		expect(body.subscribers[0]).toMatchObject({ consumerGroup: "billing", active: false, currentOffset: 4 });
		expect(body.consumerGroupOffsets[0]).toMatchObject({ consumerGroup: "billing", offset: 4 });
		expect(body.partitions[0].rangeStop).toBe(2520);
	});

	test("missing topics are 404s", async () => {
		h.admin.on("GET /api/mq/topics/nope/none", async () =>
			Response.json(await Bun.file(`${import.meta.dir}/../../fixtures/mq/topic-missing.json`).json(), {
				status: 500,
			}),
		);
		const { status, body } = await h.json("GET", "/messaging/topics/nope/none");
		expect(status).toBe(404);
		expect(body.error).toBe("Topic nope.none does not exist");
	});

	test("explains a missing broker", async () => {
		h.admin.on("GET /api/mq/topics/orders/created", () =>
			Response.json(
				{ error: "Failed to get topic details: failed to find broker leader: no broker leader found" },
				{ status: 500 },
			),
		);
		const { status, body } = await h.json("GET", "/messaging/topics/orders/created");
		expect(status).toBe(503);
		expect(body.error).toContain("weed mq.broker");
	});

	test("other failures pass through", async () => {
		h.admin.on("GET /api/mq/topics/orders/created", () =>
			Response.json({ error: "disk on fire" }, { status: 500 }),
		);
		expect((await h.json("GET", "/messaging/topics/orders/created")).status).toBe(500);
	});
});

describe("topic changes", () => {
	const create = {
		namespace: "billing",
		name: "invoices",
		partitionCount: 3,
		retention: { enabled: true, seconds: 86400 },
	};

	test("creates a topic with retention", async () => {
		h.admin.on("POST /api/mq/topics/create", { message: "Topic created successfully" });
		const { status, body } = await h.json("POST", "/messaging/topics", create);
		expect(status).toBe(201);
		expect(body).toEqual({ namespace: "billing", name: "invoices" });
		expect(JSON.parse(h.admin.last("POST", "/api/mq/topics/create")?.body ?? "")).toEqual({
			namespace: "billing",
			name: "invoices",
			partition_count: 3,
			retention: { enabled: true, retention_seconds: 86400 },
		});
	});

	test("refuses to recreate an existing topic (SeaweedFS would silently reconfigure it)", async () => {
		const { status, body } = await h.json("POST", "/messaging/topics", {
			...create,
			namespace: "orders",
			name: "created",
		});
		expect(status).toBe(409);
		expect(body.error).toBe("Topic orders.created already exists");
	});

	test("needs a broker", async () => {
		h.grpc.nodes.broker = [];
		const { status, body } = await h.json("POST", "/messaging/topics", create);
		expect(status).toBe(503);
		expect(body.error).toContain("weed mq.broker");
	});

	test("validates names, partitions and retention", async () => {
		expect((await h.json("POST", "/messaging/topics", { ...create, name: "bad name" })).status).toBe(400);
		expect((await h.json("POST", "/messaging/topics", { ...create, partitionCount: 101 })).body.error).toBe(
			"partitionCount: Use at most 100 partitions",
		);
		expect(
			(await h.json("POST", "/messaging/topics", { ...create, retention: { enabled: true, seconds: 0 } }))
				.body.error,
		).toBe("retention.seconds: Choose how long to keep messages");
	});

	test("updates retention", async () => {
		h.admin.on("POST /api/mq/topics/retention/update", { message: "ok" });
		const { status } = await h.json("PUT", "/messaging/topics/telemetry/cpu/retention", {
			enabled: false,
			seconds: 0,
		});
		expect(status).toBe(200);
		expect(JSON.parse(h.admin.last("POST", "/api/mq/topics/retention/update")?.body ?? "")).toEqual({
			namespace: "telemetry",
			name: "cpu",
			retention: { enabled: false, retention_seconds: 0 },
		});
	});

	test("retention for a missing topic is a 404", async () => {
		h.admin.on("POST /api/mq/topics/retention/update", () =>
			Response.json(
				{ error: "failed to get current topic configuration: filer: no entry is found in filer store" },
				{ status: 500 },
			),
		);
		const { status, body } = await h.json("PUT", "/messaging/topics/ghost/none/retention", {
			enabled: true,
			seconds: 60,
		});
		expect(status).toBe(404);
		expect(body.error).toBe("Topic ghost.none does not exist");
	});

	test("explains a broker that disappears mid-create, and purge failures", async () => {
		h.admin.on("POST /api/mq/topics/create", () =>
			Response.json(
				{ error: "Failed to create topic: failed to find broker leader: no broker leader found" },
				{ status: 500 },
			),
		);
		expect((await h.json("POST", "/messaging/topics", create)).status).toBe(503);
		h.admin.on("POST /api/mq/retention/purge", () =>
			Response.json({ error: "filer unavailable" }, { status: 500 }),
		);
		const { status, body } = await h.json("POST", "/messaging/retention/purge");
		expect(status).toBe(500);
		expect(body.error).toBe("filer unavailable");
	});

	test("purges expired data", async () => {
		h.admin.on("POST /api/mq/retention/purge", { message: "ok" });
		expect((await h.json("POST", "/messaging/retention/purge")).body).toEqual({ ok: true });
	});

	test("viewers cannot change topics", async () => {
		const viewer = await harness({ role: "viewer" });
		expect((await viewer.json("POST", "/messaging/retention/purge")).status).toBe(403);
		await viewer.stop();
	});
});
