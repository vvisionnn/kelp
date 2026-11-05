import { describe, expect, test } from "bun:test";
import type { IamGroup, IamPolicy, IamUser, ServiceAccount } from "@shared/iam.ts";
import {
	accessKind,
	accessMatrix,
	actionFrequency,
	actionGrant,
	ageInDays,
	attentionItems,
	expiryTimeline,
	groupAsIdentity,
	keyAges,
	levelOf,
	policyGrants,
	policyReach,
	resourceBucket,
	s3ActionCapabilities,
	userAccess,
} from "./analysis.ts";

const NOW = Date.parse("2026-11-05T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

function user(partial: Partial<IamUser> & { username: string }): IamUser {
	return { email: "", actions: [], policies: [], groups: [], accessKeys: [], isStatic: false, ...partial };
}

function policy(
	name: string,
	statements: Array<Record<string, unknown>>,
	attached = { users: [] as string[], groups: [] as string[] },
): IamPolicy {
	return {
		name,
		document: { Version: "2012-10-17", Statement: statements },
		statementCount: statements.length,
		createdAt: null,
		updatedAt: null,
		attachedTo: attached,
	};
}

const readMedia = policy(
	"read-media",
	[
		{
			Effect: "Allow",
			Action: ["s3:GetObject", "s3:ListBucket"],
			Resource: ["arn:aws:s3:::media", "arn:aws:s3:::media/*"],
		},
	],
	{ users: ["ana"], groups: ["design"] },
);
const writeLogs = policy("write-logs", [
	{ Effect: "Allow", Action: "s3:PutObject", Resource: "arn:aws:s3:::logs/*" },
	{ Effect: "Allow", Action: ["s3:DeleteObject"], Resource: ["arn:aws:s3:::logs/*"] },
]);
const everything = policy("everything", [{ Effect: "Allow", Action: "s3:*", Resource: "*" }]);
const denyLogs = policy("deny-logs", [
	{ Effect: "Allow", Action: "s3:GetObject", Resource: "arn:aws:s3:::logs/*" },
	{ Effect: "Deny", Action: ["s3:GetObject"], Resource: ["arn:aws:s3:::logs/*"] },
	{ Effect: "Allow", Action: ["iam:CreateUser", "s3:Unknown"], Resource: "*" },
]);
const policies = [readMedia, writeLogs, everything, denyLogs];
const design: IamGroup = { name: "design", enabled: true, members: ["ana", "ben"], policies: ["read-media"] };
const off: IamGroup = { name: "off", enabled: false, members: ["ben"], policies: ["everything"] };
const groups = [design, off];

describe("access analysis", () => {
	test("built-in actions map to capabilities, scoped or not", () => {
		expect(actionGrant("Admin")).toEqual({
			bucket: "*",
			capabilities: ["admin", "write", "delete", "read", "list"],
		});
		expect(actionGrant("Write:media/path")).toEqual({ bucket: "media", capabilities: ["write", "delete"] });
		expect(actionGrant("Tagging")).toBeNull();
	});

	test("S3 actions and resources", () => {
		expect(s3ActionCapabilities("s3:*")).toContain("admin");
		expect(s3ActionCapabilities("*")).toContain("admin");
		expect(s3ActionCapabilities("s3:CreateBucket")).toEqual(["admin"]);
		expect(s3ActionCapabilities("s3:PutBucketPolicy")).toEqual(["admin"]);
		expect(s3ActionCapabilities("s3:ListBucket")).toEqual(["list"]);
		expect(s3ActionCapabilities("s3:GetObject")).toEqual(["read"]);
		expect(s3ActionCapabilities("s3:DeleteObject")).toEqual(["delete"]);
		expect(s3ActionCapabilities("s3:PutObject")).toEqual(["write"]);
		expect(s3ActionCapabilities("s3:AbortMultipartUpload")).toEqual(["write"]);
		expect(s3ActionCapabilities("s3:Whatever")).toEqual([]);
		expect(s3ActionCapabilities("iam:CreateUser")).toEqual([]);
		expect(resourceBucket("*")).toBe("*");
		expect(resourceBucket("arn:aws:s3:::*")).toBe("*");
		expect(resourceBucket("arn:aws:s3:::media/a/b")).toBe("media");
	});

	test("policy grants split allows and denies and skip what they don't recognize", () => {
		expect(policyGrants(writeLogs).allow).toEqual([
			{ bucket: "logs", capabilities: ["write", "delete"], via: ["Policy write-logs"] },
		]);
		const denied = policyGrants(denyLogs);
		expect(denied.deny[0]?.bucket).toBe("logs");
		expect(policyGrants(everything).allow[0]?.bucket).toBe("*");
	});

	test("a user's access combines actions, policies and enabled groups, minus denies", () => {
		const ana = user({ username: "ana", actions: ["List:archive"], policies: ["write-logs", "missing"] });
		const grants = userAccess(ana, groups, policies);
		expect(grants.map((g) => g.bucket)).toEqual(["archive", "logs", "media"]);
		expect(grants.find((g) => g.bucket === "media")?.via).toEqual(["Group design"]);
		const ben = user({ username: "ben", policies: ["deny-logs"] });
		expect(userAccess(ben, groups, policies).map((g) => g.bucket)).toEqual(["media"]);
	});

	test("levels and the matrix fill every bucket from all-bucket grants", () => {
		expect(levelOf(["list"])).toBe("list");
		expect(levelOf(["read", "list"])).toBe("read");
		expect(levelOf(["delete"])).toBe("write");
		expect(levelOf(["admin"])).toBe("admin");
		expect(levelOf([])).toBeNull();
		const root = user({ username: "root", actions: ["Admin"] });
		const ana = user({ username: "ana", policies: ["write-logs"] });
		const reader = user({ username: "reader", actions: ["Read"], policies: ["write-logs"] });
		const matrix = accessMatrix([root, ana, reader], groups, policies, ["media", "logs"]);
		expect(matrix.buckets).toEqual(["logs", "media"]);
		const [r, a, rd] = matrix.rows;
		expect(r?.all.level).toBe("admin");
		expect(r?.cells.media).toEqual({ level: "admin", inherited: true, via: ["Action Admin"] });
		expect(a?.cells.logs?.level).toBe("write");
		expect(a?.cells.logs?.inherited).toBe(false);
		expect(a?.cells.media?.level).toBe("read");
		expect(rd?.cells.logs?.level).toBe("write");
		expect(rd?.cells.media?.inherited).toBe(true);
	});

	test("access kinds", () => {
		expect(accessKind(user({ username: "x", actions: ["Admin"] }), groups, policies)).toBe("admin");
		expect(accessKind(user({ username: "x" }), groups, policies)).toBe("none");
		expect(accessKind(user({ username: "x", actions: ["Read:media"] }), groups, policies)).toBe("actions");
		expect(accessKind(user({ username: "ana" }), groups, policies)).toBe("policies");
	});

	test("key ages fall into bands and unknown ages are skipped", () => {
		expect(ageInDays(null)).toBeNull();
		expect(ageInDays("nonsense")).toBeNull();
		expect(ageInDays(daysAgo(3), NOW)).toBe(3);
		const ages = keyAges(
			[
				{ accessKey: "a", status: "Active", createdAt: daysAgo(2) },
				{ accessKey: "b", status: "Active", createdAt: daysAgo(400) },
				{ accessKey: "c", status: "Active", createdAt: null },
			],
			NOW,
		);
		expect(ages[0]?.value).toBe(1);
		expect(ages.at(-1)?.value).toBe(1);
	});

	test("attention: old admin keys first, then stale keys, then quiet users", () => {
		const items = attentionItems(
			[
				user({
					username: "root",
					actions: ["Admin"],
					accessKeys: [{ accessKey: "k", status: "Active", createdAt: daysAgo(200) }],
				}),
				user({
					username: "old",
					policies: ["write-logs"],
					accessKeys: [{ accessKey: "k", status: "Active", createdAt: daysAgo(120) }],
				}),
				user({ username: "keyless" }),
				user({ username: "paused", accessKeys: [{ accessKey: "k", status: "Inactive", createdAt: null }] }),
				user({
					username: "nowhere",
					accessKeys: [{ accessKey: "k", status: "Active", createdAt: daysAgo(1) }],
				}),
				user({ username: "static", isStatic: true, actions: ["Admin"] }),
			],
			groups,
			policies,
			NOW,
		);
		expect(items.map((i) => i.key)).toEqual([
			"root-admin-old",
			"old-old",
			"nowhere-noaccess",
			"keyless-nokeys",
			"paused-paused",
		]);
	});

	test("action frequency, policy reach and groups as identities", () => {
		expect(actionFrequency([readMedia, writeLogs, denyLogs])[0]).toEqual({
			action: "s3:GetObject",
			policies: 2,
		});
		expect(policyReach(readMedia, groups)).toEqual(["ana", "ben"]);
		expect(policyReach(everything, groups)).toEqual([]);
		expect(groupAsIdentity(design).policies).toEqual(["read-media"]);
		expect(groupAsIdentity(off).policies).toEqual([]);
	});

	test("the expiry timeline buckets the next twelve months", () => {
		const account = (expiresAt: string | null): ServiceAccount => ({
			id: expiresAt ?? "never",
			parentUser: "ana",
			description: "",
			accessKey: "k",
			status: "Active",
			createdAt: null,
			expiresAt,
		});
		const timeline = expiryTimeline(
			[account(null), account(daysAgo(1)), account(daysAgo(-10)), account(daysAgo(-800))],
			NOW,
		);
		expect(timeline.never).toBe(1);
		expect(timeline.expired).toBe(1);
		expect(timeline.later).toBe(1);
		expect(timeline.months).toHaveLength(12);
		expect(timeline.months.reduce((sum, m) => sum + m.value, 0)).toBe(1);
		expect(timeline.months[0]?.label).toBe("Nov");
	});
});
