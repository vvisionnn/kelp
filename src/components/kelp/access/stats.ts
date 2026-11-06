import type { IamGroup, IamPolicy, IamUser } from "@shared/iam.ts";
import { accessKind, ageInDays, ROTATE_AFTER_DAYS } from "@/components/kelp/access/analysis.ts";

/** Headline numbers for the groups page. */
export function groupStats(groups: IamGroup[], users: IamUser[]) {
	const members = new Set(groups.flatMap((group) => group.members));
	return {
		groups: groups.length,
		off: groups.filter((group) => !group.enabled).length,
		memberships: groups.reduce((sum, group) => sum + group.members.length, 0),
		outside: users.filter((user) => !members.has(user.username)).map((user) => user.username),
		attached: groups.reduce((sum, group) => sum + group.policies.length, 0),
	};
}

/** Headline numbers for the policies page. */
export function policyStats(policies: IamPolicy[]) {
	const used = policies.filter((p) => p.attachedTo.users.length + p.attachedTo.groups.length > 0).length;
	return [
		{ label: "Policies", value: policies.length },
		{ label: "Attached somewhere", value: used },
		{ label: "Not attached", value: policies.length - used },
		{ label: "Statements in all", value: policies.reduce((sum, p) => sum + p.statementCount, 0) },
	];
}

/** Headline numbers for the users page: who exists, which keys sign, and what needs care. */
export function userStats(users: IamUser[], groups: IamGroup[], policies: IamPolicy[], now = Date.now()) {
	const keys = users.flatMap((user) => user.accessKeys);
	const active = keys.filter((key) => key.status === "Active");
	const ages = active
		.map((key) => ageInDays(key.createdAt, now))
		.filter((age): age is number => age !== null);
	const kinds = users.map((user) => accessKind(user, groups, policies));
	return {
		users: users.length,
		active: active.length,
		paused: keys.length - active.length,
		rotate: ages.filter((age) => age >= ROTATE_AFTER_DAYS).length,
		oldest: ages.length > 0 ? Math.max(...ages) : null,
		admins: kinds.filter((kind) => kind === "admin").length,
		reachNothing: kinds.filter((kind) => kind === "none").length,
	};
}
