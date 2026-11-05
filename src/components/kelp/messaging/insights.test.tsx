import { describe, expect, test } from "bun:test";
import type { MessagingOverview, TopicDetail, TopicSummary } from "@shared/messaging.ts";
import { screen, within } from "@testing-library/react";
import { renderApp } from "../../../../test/render-app.tsx";
import { messagingApi } from "../../../../test/streams-fixtures.ts";
import { consumerLag, longestRetention } from "./insights.tsx";

function topic(partial: Partial<TopicSummary>): TopicSummary {
	return {
		namespace: "ns",
		name: "t",
		partitionCount: 1,
		messageCount: 0,
		totalSize: 0,
		retention: { enabled: false, seconds: 0 },
		createdAt: null,
		lastUpdated: null,
		...partial,
	};
}

describe("messaging insights", () => {
	test("longest retention ignores topics that keep data forever", () => {
		expect(longestRetention([topic({})])).toBeNull();
		expect(
			longestRetention([
				topic({ name: "a", retention: { enabled: true, seconds: 60 } }),
				topic({ name: "b", retention: { enabled: true, seconds: 600 } }),
			])?.name,
		).toBe("b");
	});

	test("consumer lag sums what each group has yet to read, by partition order", async () => {
		const { busy } = await messagingApi();
		const detail: TopicDetail = {
			...busy,
			consumerGroupOffsets: [
				{ consumerGroup: "billing", partition: 0, offset: 0, updatedAt: null },
				{ consumerGroup: "billing", partition: 1, offset: 999_999, updatedAt: null },
				{ consumerGroup: "audit", partition: 99, offset: 0, updatedAt: null },
			],
		};
		const lag = consumerLag(detail);
		expect(lag.map((g) => g.group)).toEqual(["billing", "audit"]);
		expect(lag[0]?.partitions).toBe(2);
		expect(lag[1]?.lag).toBe(0);
	});

	test("the messaging page leads with topics, partitions and retention", async () => {
		const { overview } = await messagingApi();
		const leaderless: MessagingOverview = {
			...overview,
			leader: null,
			topics: [...overview.topics, topic({ name: "huge", messageCount: 5000, totalSize: 1024 })],
		};
		renderApp("/messaging", { "GET /messaging": leaderless });
		expect(await screen.findByText("Electing a leader")).toBeTruthy();
		expect(screen.getByRole("list", { name: "Partitions by topic" })).toBeTruthy();
		expect(
			within(screen.getByRole("list", { name: "Topics by messages" })).getByText("ns.huge"),
		).toBeTruthy();
		expect(
			within(screen.getByRole("list", { name: "Retention by topic" })).getAllByText("Forever").length,
		).toBeGreaterThan(0);
	});

	test("a topic shows its partition spread and consumer groups", async () => {
		const { busy } = await messagingApi();
		const skewed: TopicDetail = {
			...busy,
			messageCount: 100,
			partitions: busy.partitions.map((p, i) => ({ ...p, messageCount: i === 0 ? 1000 : 1 })),
			consumerGroupOffsets: [{ consumerGroup: "billing", partition: 0, offset: 10, updatedAt: null }],
		};
		renderApp("/messaging/orders/created", { "GET /messaging/topics/orders/created": skewed });
		expect(await screen.findByRole("img", { name: "Messages per partition" })).toBeTruthy();
		expect(screen.getByRole("region", { name: "Partitions" }).textContent).toMatch(/Busiest holds/);
		expect(
			within(screen.getByRole("list", { name: "Consumer lag by group" })).getByText("billing"),
		).toBeTruthy();
	});
});
