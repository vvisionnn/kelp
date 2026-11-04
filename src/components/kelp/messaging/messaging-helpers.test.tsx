import { describe, expect, test } from "bun:test";
import type { TopicPartition } from "@shared/messaging.ts";
import { arcPath, leaderColors } from "./partition-ring.tsx";
import { draftFrom, formatRetention, retentionFrom, retentionSeconds, splitRetention } from "./retention.tsx";

describe("retention", () => {
	test("reads naturally", () => {
		expect(formatRetention({ enabled: false, seconds: 0 })).toBe("Keep forever");
		expect(formatRetention({ enabled: true, seconds: 0 })).toBe("Keep forever");
		expect(formatRetention({ enabled: true, seconds: 604800 })).toBe("1 week");
		expect(formatRetention({ enabled: true, seconds: 2 * 86400 })).toBe("2 days");
		expect(formatRetention({ enabled: true, seconds: 36 * 3600 })).toBe("36 hours");
		expect(formatRetention({ enabled: true, seconds: 90 })).toBe("90 seconds");
		expect(formatRetention({ enabled: true, seconds: 120 })).toBe("2 minutes");
	});

	test("splits into the largest even unit and back", () => {
		expect(splitRetention(0)).toEqual({ value: 7, unit: "days" });
		expect(splitRetention(1209600)).toEqual({ value: 2, unit: "weeks" });
		expect(splitRetention(3 * 86400)).toEqual({ value: 3, unit: "days" });
		expect(splitRetention(5400)).toEqual({ value: 2, unit: "hours" });
		expect(retentionSeconds(3, "hours")).toBe(10800);
		expect(retentionFrom(draftFrom({ enabled: true, seconds: 7200 }))).toEqual({
			enabled: true,
			seconds: 7200,
		});
		expect(retentionFrom({ enabled: false, value: 3, unit: "days" })).toEqual({ enabled: false, seconds: 0 });
	});
});

describe("partition ring", () => {
	test("draws arcs, closing a single full-ring partition just short", () => {
		expect(arcPath(0, 630)).toMatch(/^M [\d.]+ [\d.]+ A 100 100 0 0 1 [\d.]+ [\d.]+$/);
		expect(arcPath(0, 2520)).toContain("A 100 100 0 1 1");
		expect(arcPath(0, 10)).toBe(arcPath(0, 10, 0));
	});

	test("colors leaders in first-seen order", () => {
		const p = (leader: string) => ({ leader }) as TopicPartition;
		const colors = leaderColors([p("b"), p("a"), p("b"), p("c"), p("d"), p("e"), p("f")]);
		expect([...colors.keys()]).toEqual(["b", "a", "c", "d", "e", "f"]);
		expect(colors.get("f")).toBe(colors.get("b"));
	});
});

describe("election polling", () => {
	test("only while brokers exist without a leader", async () => {
		const { electing } = await import("@/lib/streams-queries.ts");
		const broker = { address: "b:1", version: "", dataCenter: "", rack: "", createdAt: null };
		expect(electing(undefined)).toBe(false);
		expect(electing({ brokers: [], leader: null, topics: [] })).toBe(false);
		expect(electing({ brokers: [broker], leader: null, topics: [] })).toBe(true);
		expect(electing({ brokers: [broker], leader: "b:1", topics: [] })).toBe(false);
	});
});
