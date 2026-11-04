import { Hono } from "hono";
import { z } from "zod";
import type { MessagingOverview, TopicSummary } from "../../shared/messaging.ts";
import type { Env } from "../app.ts";
import { mapTopicDetail, mapTopicSummary } from "../map/messaging.ts";
import type { Raw } from "../map/raw.ts";
import type { Services } from "../services.ts";
import { UpstreamError } from "../upstream/http.ts";

const NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const name = (what: string) =>
	z
		.string()
		.trim()
		.regex(
			NAME,
			`${what} can use letters, digits, dots, dashes and underscores, starting with a letter or digit`,
		);

const retention = z
	.object({
		enabled: z.boolean(),
		seconds: z
			.number()
			.int()
			.min(0)
			.max(100 * 365 * 86_400),
	})
	.refine((r) => !r.enabled || r.seconds > 0, {
		message: "Choose how long to keep messages",
		path: ["seconds"],
	});

const createTopic = z.object({
	namespace: name("Namespace"),
	name: name("Topic name"),
	partitionCount: z.number().int().min(1, "Use at least 1 partition").max(100, "Use at most 100 partitions"),
	retention,
});

const NO_BROKER = "No message queue broker is running. Start one with `weed mq.broker -master=<master>`.";

/** The admin answers 500 for every MQ failure; turn the common ones into meaningful statuses. */
function mqError(error: unknown, topic?: string): never {
	if (error instanceof UpstreamError) {
		if (/no broker|broker leader/i.test(error.message))
			throw new UpstreamError(error.upstream, 503, NO_BROKER);
		if (topic && /no entry is found|not found/i.test(error.message)) {
			throw new UpstreamError(error.upstream, 404, `Topic ${topic} does not exist`);
		}
	}
	throw error;
}

/** Runs `fn` over `items` with at most `limit` in flight. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (next < items.length) {
				const index = next++;
				results[index] = await fn(items[index] as T);
			}
		}),
	);
	return results;
}

export function messagingRoutes({ admin, grpc }: Services) {
	const topicPath = (namespace: string, topic: string) =>
		`mq/topics/${encodeURIComponent(namespace)}/${encodeURIComponent(topic)}`;

	/** Brokers, the elected leader, and the broker to ask about topics. */
	async function brokers() {
		const nodes = await grpc.listClusterNodes("broker");
		let leader: string | null = null;
		for (const node of nodes) {
			try {
				leader = await grpc.findBrokerLeader(node.address);
				break;
			} catch {
				// Still electing, or this broker is unreachable; try the next one.
			}
		}
		return { nodes, leader, ask: leader ?? nodes[0]?.address ?? null };
	}

	return new Hono<Env>()
		.get("/messaging", async (c) => {
			const { nodes, leader, ask } = await brokers();
			if (!ask) return c.json({ brokers: nodes, leader, topics: [] } satisfies MessagingOverview);
			// Mid-election a broker may refuse to list topics; report the election instead of failing.
			const names = await grpc.listTopics(ask).catch((error) => {
				if (leader) throw error;
				return [];
			});
			const topics = await mapLimit(names, 6, async (t): Promise<TopicSummary> => {
				try {
					return mapTopicSummary(await admin.json<Raw>(topicPath(t.namespace, t.name)));
				} catch (error) {
					return {
						namespace: t.namespace,
						name: t.name,
						partitionCount: 0,
						messageCount: 0,
						totalSize: 0,
						retention: { enabled: false, seconds: 0 },
						createdAt: null,
						lastUpdated: null,
						detailError: (error as Error).message,
					};
				}
			});
			return c.json({ brokers: nodes, leader, topics } satisfies MessagingOverview);
		})
		.get("/messaging/topics/:namespace/:topic", async (c) => {
			const { namespace, topic } = c.req.param();
			const raw = await admin
				.json<Raw>(topicPath(namespace, topic))
				.catch((e) => mqError(e, `${namespace}.${topic}`));
			return c.json(mapTopicDetail(raw));
		})
		.post("/messaging/topics", async (c) => {
			const input = createTopic.parse(await c.req.json());
			const { ask } = await brokers();
			if (!ask) throw new UpstreamError("grpc", 503, NO_BROKER);
			const existing = await grpc.listTopics(ask);
			if (existing.some((t) => t.namespace === input.namespace && t.name === input.name)) {
				return c.json({ error: `Topic ${input.namespace}.${input.name} already exists` }, 409);
			}
			await admin
				.json("mq/topics/create", {
					method: "POST",
					body: {
						namespace: input.namespace,
						name: input.name,
						partition_count: input.partitionCount,
						retention: { enabled: input.retention.enabled, retention_seconds: input.retention.seconds },
					},
				})
				.catch((e) => mqError(e));
			return c.json({ namespace: input.namespace, name: input.name }, 201);
		})
		.put("/messaging/topics/:namespace/:topic/retention", async (c) => {
			const { namespace, topic } = c.req.param();
			const input = retention.parse(await c.req.json());
			await admin
				.json("mq/topics/retention/update", {
					method: "POST",
					body: {
						namespace,
						name: topic,
						retention: { enabled: input.enabled, retention_seconds: input.seconds },
					},
				})
				.catch((e) => mqError(e, `${namespace}.${topic}`));
			return c.json({ ok: true });
		})
		.post("/messaging/retention/purge", async (c) => {
			await admin.json("mq/retention/purge", { method: "POST" }).catch((e) => mqError(e));
			return c.json({ ok: true });
		});
}
