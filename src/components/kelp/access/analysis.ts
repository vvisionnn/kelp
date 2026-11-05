/**
 * Access analysis: what each identity can actually do, per bucket, once direct actions, attached
 * policies and group policies are combined. Pure functions, so the pages and tests share them.
 */
import type { AccessKeyInfo, IamGroup, IamPolicy, IamUser, ServiceAccount } from "@shared/iam.ts";

export type Capability = "list" | "read" | "write" | "delete" | "admin";

/** The strongest thing an identity can do to a bucket, in ascending order of reach. */
export type AccessLevel = "list" | "read" | "write" | "admin";

export const LEVELS: AccessLevel[] = ["list", "read", "write", "admin"];

export const LEVEL_LABEL: Record<AccessLevel, string> = {
	list: "List",
	read: "Read",
	write: "Read and write",
	admin: "Full control",
};

/** "*" stands for every bucket. */
export const ALL_BUCKETS = "*";

export interface BucketGrant {
	bucket: string;
	capabilities: Capability[];
	/** Where the access comes from, e.g. "Policy media-read-write", "Group designers", "Action Read". */
	via: string[];
}

type Grants = Map<string, { capabilities: Set<Capability>; via: Set<string> }>;

function add(grants: Grants, bucket: string, capabilities: Capability[], via: string) {
	const entry = grants.get(bucket) ?? { capabilities: new Set(), via: new Set() };
	for (const capability of capabilities) entry.capabilities.add(capability);
	entry.via.add(via);
	grants.set(bucket, entry);
}

/** SeaweedFS's built-in actions (`Read`, `Write:media`, `Admin`) as capabilities on a bucket. */
export function actionGrant(action: string): { bucket: string; capabilities: Capability[] } | null {
	const [verb = "", scope = ""] = action.split(":");
	const bucket = scope.split("/")[0] || ALL_BUCKETS;
	const capabilities: Record<string, Capability[]> = {
		Admin: ["admin", "write", "delete", "read", "list"],
		Read: ["read"],
		Write: ["write", "delete"],
		List: ["list"],
	};
	const granted = capabilities[verb];
	return granted ? { bucket, capabilities: granted } : null;
}

/** What one S3 IAM action allows, e.g. `s3:GetObject` → read. */
export function s3ActionCapabilities(action: string): Capability[] {
	const name = action.toLowerCase();
	if (name === "*" || name === "s3:*") return ["admin", "write", "delete", "read", "list"];
	if (!name.startsWith("s3:")) return [];
	const verb = name.slice(3);
	if (/^(create|delete|put)bucket/.test(verb) || verb.startsWith("putbucket")) return ["admin"];
	if (verb.startsWith("list")) return ["list"];
	if (verb.startsWith("get") || verb === "*object*") return ["read"];
	if (verb.startsWith("delete")) return ["delete"];
	if (verb.startsWith("put") || verb.startsWith("abortmultipart") || verb.startsWith("restore"))
		return ["write"];
	return [];
}

/** The bucket an S3 resource ARN points at; "*" for all of them. */
export function resourceBucket(resource: string): string {
	if (resource === "*") return ALL_BUCKETS;
	const name = resource.replace(/^arn:aws:s3:::/, "").split("/")[0] ?? "";
	return name === "" || name === "*" ? ALL_BUCKETS : name;
}

const asList = (value: unknown): string[] =>
	Array.isArray(value)
		? value.filter((v): v is string => typeof v === "string")
		: typeof value === "string"
			? [value]
			: [];

/** The buckets and capabilities a policy document grants (Allow) and takes away (Deny). */
export function policyGrants(policy: IamPolicy): { allow: BucketGrant[]; deny: BucketGrant[] } {
	const allow: Grants = new Map();
	const deny: Grants = new Map();
	for (const statement of policy.document.Statement) {
		const capabilities = [...new Set(asList(statement.Action).flatMap(s3ActionCapabilities))];
		const buckets = [...new Set(asList(statement.Resource).map(resourceBucket))];
		if (capabilities.length === 0 || buckets.length === 0) continue;
		const target = statement.Effect === "Deny" ? deny : allow;
		for (const bucket of buckets) add(target, bucket, capabilities, `Policy ${policy.name}`);
	}
	return { allow: toList(allow), deny: toList(deny) };
}

function toList(grants: Grants): BucketGrant[] {
	return [...grants.entries()]
		.map(([bucket, { capabilities, via }]) => ({ bucket, capabilities: [...capabilities], via: [...via] }))
		.sort((a, b) =>
			a.bucket === ALL_BUCKETS ? -1 : b.bucket === ALL_BUCKETS ? 1 : a.bucket.localeCompare(b.bucket),
		);
}

/**
 * Everything a user can do, per bucket: direct actions, directly attached policies, and the
 * policies of every enabled group they belong to, minus explicit denies.
 */
export function userAccess(user: IamUser, groups: IamGroup[], policies: IamPolicy[]): BucketGrant[] {
	const byName = new Map(policies.map((p) => [p.name, p]));
	const allow: Grants = new Map();
	const denied: Grants = new Map();
	const apply = (name: string, via: string) => {
		const policy = byName.get(name);
		if (!policy) return;
		const grants = policyGrants(policy);
		for (const g of grants.allow) add(allow, g.bucket, g.capabilities, via);
		for (const g of grants.deny) add(denied, g.bucket, g.capabilities, via);
	};
	for (const action of user.actions) {
		const grant = actionGrant(action);
		if (grant) add(allow, grant.bucket, grant.capabilities, `Action ${action.split(":")[0]}`);
	}
	for (const name of user.policies) apply(name, `Policy ${name}`);
	for (const group of groups) {
		if (!group.enabled || !group.members.includes(user.username)) continue;
		for (const name of group.policies) apply(name, `Group ${group.name}`);
	}
	for (const [bucket, deny] of denied) {
		const entry = allow.get(bucket);
		if (!entry) continue;
		for (const capability of deny.capabilities) entry.capabilities.delete(capability);
		if (entry.capabilities.size === 0) allow.delete(bucket);
	}
	return toList(allow);
}

/** The strongest level a set of capabilities adds up to. */
export function levelOf(capabilities: Capability[]): AccessLevel | null {
	if (capabilities.includes("admin")) return "admin";
	if (capabilities.includes("write") || capabilities.includes("delete")) return "write";
	if (capabilities.includes("read")) return "read";
	if (capabilities.includes("list")) return "list";
	return null;
}

function stronger(a: AccessLevel | null, b: AccessLevel | null): AccessLevel | null {
	if (!a) return b;
	if (!b) return a;
	return LEVELS.indexOf(a) >= LEVELS.indexOf(b) ? a : b;
}

export interface MatrixCell {
	level: AccessLevel | null;
	/** True when the level comes only from an all-buckets grant. */
	inherited: boolean;
	via: string[];
}

export interface AccessMatrix {
	/** Bucket columns: the real buckets, plus any named in grants that no longer exist. */
	buckets: string[];
	rows: Array<{ user: string; all: MatrixCell; cells: Record<string, MatrixCell> }>;
}

/** Users by buckets: who can reach what, with all-bucket grants applied to every bucket. */
export function accessMatrix(
	users: IamUser[],
	groups: IamGroup[],
	policies: IamPolicy[],
	existingBuckets: string[],
): AccessMatrix {
	const access = users.map((user) => ({ user: user.username, grants: userAccess(user, groups, policies) }));
	const named = access.flatMap((a) => a.grants.map((g) => g.bucket)).filter((b) => b !== ALL_BUCKETS);
	const buckets = [...new Set([...existingBuckets, ...named])].sort();
	const rows = access.map(({ user, grants }) => {
		const star = grants.find((g) => g.bucket === ALL_BUCKETS);
		const all: MatrixCell = {
			level: star ? levelOf(star.capabilities) : null,
			inherited: false,
			via: star?.via ?? [],
		};
		const cells: Record<string, MatrixCell> = {};
		for (const bucket of buckets) {
			const own = grants.find((g) => g.bucket === bucket);
			const ownLevel = own ? levelOf(own.capabilities) : null;
			const level = stronger(ownLevel, all.level);
			cells[bucket] = {
				level,
				inherited: level !== null && level !== ownLevel,
				via: [...new Set([...(own?.via ?? []), ...(level !== ownLevel ? all.via : [])])],
			};
		}
		return { user, all, cells };
	});
	return { buckets, rows };
}

/** How each user gets their access, for the permission mix ring. */
export type AccessKind = "admin" | "policies" | "actions" | "none";

export function accessKind(user: IamUser, groups: IamGroup[], policies: IamPolicy[]): AccessKind {
	const grants = userAccess(user, groups, policies);
	if (grants.some((g) => g.capabilities.includes("admin") && g.bucket === ALL_BUCKETS)) return "admin";
	if (grants.length === 0) return "none";
	return grants.some((g) => g.via.some((v) => !v.startsWith("Action "))) ? "policies" : "actions";
}

const DAY = 86_400_000;

/** Whole days since an ISO time; null when unknown. */
export function ageInDays(iso: string | null, now = Date.now()): number | null {
	if (!iso) return null;
	const time = Date.parse(iso);
	return Number.isNaN(time) ? null : Math.max(0, Math.floor((now - time) / DAY));
}

/** Age bands for access keys, youngest first. */
export const AGE_BANDS: Array<{ label: string; maxDays: number }> = [
	{ label: "< 1 week", maxDays: 7 },
	{ label: "1–4 weeks", maxDays: 30 },
	{ label: "1–3 months", maxDays: 90 },
	{ label: "3–6 months", maxDays: 182 },
	{ label: "6–12 months", maxDays: 365 },
	{ label: "> 1 year", maxDays: Number.POSITIVE_INFINITY },
];

/** Counts keys per age band; keys without a creation time are left out. */
export function keyAges(keys: AccessKeyInfo[], now = Date.now()) {
	const counts = AGE_BANDS.map((band) => ({ label: band.label, value: 0 }));
	for (const key of keys) {
		const age = ageInDays(key.createdAt, now);
		if (age === null) continue;
		const index = AGE_BANDS.findIndex((band) => age < band.maxDays);
		(counts[index] as { value: number }).value++;
	}
	return counts;
}

/** Keys older than this should be rotated. */
export const ROTATE_AFTER_DAYS = 90;

export interface Attention {
	key: string;
	tone: "warn" | "bad" | "info";
	title: string;
	detail: string;
	/** Link target for the user or account to look at. */
	user: string;
}

/** Things an operator should look at, most serious first. */
export function attentionItems(
	users: IamUser[],
	groups: IamGroup[],
	policies: IamPolicy[],
	now = Date.now(),
): Attention[] {
	const items: Attention[] = [];
	for (const user of users) {
		const kind = accessKind(user, groups, policies);
		const active = user.accessKeys.filter((k) => k.status === "Active");
		const oldest = Math.max(-1, ...active.map((k) => ageInDays(k.createdAt, now) ?? -1));
		if (kind === "admin" && active.length > 0 && oldest >= ROTATE_AFTER_DAYS)
			items.push({
				key: `${user.username}-admin-old`,
				tone: "bad",
				user: user.username,
				title: `${user.username} has full control with a ${oldest}-day-old key`,
				detail: "Rotate the key, or scope this user down to the buckets it needs.",
			});
		else if (oldest >= ROTATE_AFTER_DAYS)
			items.push({
				key: `${user.username}-old`,
				tone: "warn",
				user: user.username,
				title: `${user.username}'s key is ${oldest} days old`,
				detail: `Keys older than ${ROTATE_AFTER_DAYS} days should be rotated.`,
			});
		if (user.accessKeys.length === 0 && !user.isStatic)
			items.push({
				key: `${user.username}-nokeys`,
				tone: "info",
				user: user.username,
				title: `${user.username} has no access keys`,
				detail: "The user cannot sign requests. Create a key or remove the user.",
			});
		else if (active.length === 0 && user.accessKeys.length > 0)
			items.push({
				key: `${user.username}-paused`,
				tone: "info",
				user: user.username,
				title: `Every key of ${user.username} is paused`,
				detail: "Nothing signs as this user until a key is switched back on.",
			});
		if (kind === "none" && active.length > 0)
			items.push({
				key: `${user.username}-noaccess`,
				tone: "warn",
				user: user.username,
				title: `${user.username} can sign but reach nothing`,
				detail: "Its keys work, but no action, policy or group grants access to a bucket.",
			});
	}
	const rank = { bad: 0, warn: 1, info: 2 };
	return items.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

/** How often each S3 action is allowed across policies, most granted first. */
export function actionFrequency(policies: IamPolicy[]): Array<{ action: string; policies: number }> {
	const counts = new Map<string, number>();
	for (const policy of policies) {
		const actions = new Set(
			policy.document.Statement.filter((s) => s.Effect !== "Deny").flatMap((s) => asList(s.Action)),
		);
		for (const action of actions) counts.set(action, (counts.get(action) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([action, count]) => ({ action, policies: count }))
		.sort((a, b) => b.policies - a.policies || a.action.localeCompare(b.action));
}

/** Everyone a policy reaches: users it is attached to directly and members of its groups. */
export function policyReach(policy: IamPolicy, groups: IamGroup[]): string[] {
	const members = groups
		.filter((g) => g.enabled && policy.attachedTo.groups.includes(g.name))
		.flatMap((g) => g.members);
	return [...new Set([...policy.attachedTo.users, ...members])].sort();
}

/** Service accounts by when they expire, for the next twelve months plus "never" and "expired". */
export function expiryTimeline(accounts: ServiceAccount[], now = Date.now()) {
	const start = new Date(now);
	const months = Array.from({ length: 12 }, (_, i) => {
		const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
		return {
			key: `${date.getUTCFullYear()}-${date.getUTCMonth()}`,
			label: date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
			value: 0,
		};
	});
	let never = 0;
	let expired = 0;
	let later = 0;
	for (const account of accounts) {
		if (!account.expiresAt) {
			never++;
			continue;
		}
		const at = new Date(account.expiresAt);
		if (at.getTime() <= now) {
			expired++;
			continue;
		}
		const month = months.find((m) => m.key === `${at.getUTCFullYear()}-${at.getUTCMonth()}`);
		if (month) month.value++;
		else later++;
	}
	return { months: months.map(({ label, value }) => ({ label, value })), never, expired, later };
}

/** A group seen as one identity with its own policies, so its reach can be charted like a user's. */
export function groupAsIdentity(group: IamGroup): IamUser {
	return {
		username: group.name,
		email: "",
		actions: [],
		policies: group.enabled ? group.policies : [],
		groups: [],
		accessKeys: [],
		isStatic: false,
	};
}
