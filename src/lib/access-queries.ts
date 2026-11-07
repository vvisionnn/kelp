import type { IamGroup, IamPolicy, IamUser, ServiceAccount } from "@shared/iam.ts";
import { queryOptions } from "@tanstack/react-query";
import { api } from "./api.ts";
import { s3EndpointQuery } from "./system-config.ts";

/** Every Access query lives under this key, so one invalidation refreshes the whole area. */
export const ACCESS_KEY = ["iam"] as const;

export const accessQueries = {
	users: () =>
		queryOptions({
			queryKey: [...ACCESS_KEY, "users"],
			queryFn: async () => (await api.get<{ users: IamUser[] }>("/iam/users")).users,
		}),
	user: (username: string) =>
		queryOptions({
			queryKey: [...ACCESS_KEY, "users", username],
			queryFn: async () =>
				(await api.get<{ user: IamUser }>(`/iam/users/${encodeURIComponent(username)}`)).user,
		}),
	groups: () =>
		queryOptions({
			queryKey: [...ACCESS_KEY, "groups"],
			queryFn: async () => (await api.get<{ groups: IamGroup[] }>("/iam/groups")).groups,
		}),
	group: (name: string) =>
		queryOptions({
			queryKey: [...ACCESS_KEY, "groups", name],
			queryFn: async () =>
				(await api.get<{ group: IamGroup }>(`/iam/groups/${encodeURIComponent(name)}`)).group,
		}),
	serviceAccounts: () =>
		queryOptions({
			queryKey: [...ACCESS_KEY, "service-accounts"],
			queryFn: async () =>
				(await api.get<{ serviceAccounts: ServiceAccount[] }>("/iam/service-accounts")).serviceAccounts,
		}),
	policies: () =>
		queryOptions({
			queryKey: [...ACCESS_KEY, "policies"],
			queryFn: async () => (await api.get<{ policies: IamPolicy[] }>("/iam/policies")).policies,
		}),
	policy: (name: string) =>
		queryOptions({
			queryKey: [...ACCESS_KEY, "policies", name],
			queryFn: async () =>
				(await api.get<{ policy: IamPolicy }>(`/iam/policies/${encodeURIComponent(name)}`)).policy,
		}),
	/** Where S3 clients connect, for the environment snippet shown with new keys. */
	s3Endpoint: s3EndpointQuery,
	principals: () =>
		queryOptions({
			queryKey: [...ACCESS_KEY, "principals"],
			queryFn: async () => (await api.get<{ principals: string[] }>("/iam/principals")).principals,
			staleTime: 60_000,
		}),
};

/** SeaweedFS's built-in actions. Each can be scoped to a bucket as `Action:bucket`. */
export const BUILT_IN_ACTIONS = ["Admin", "Read", "Write", "List", "Tagging"] as const;

/** Describes a set of SeaweedFS actions in a short phrase, e.g. "Read, Write on media". */
export function describeActions(actions: string[]): string {
	if (actions.length === 0) return "No direct permissions";
	if (actions.includes("Admin")) return "Full admin";
	const byScope = new Map<string, string[]>();
	for (const action of actions) {
		const [verb = action, scope = ""] = action.split(":");
		byScope.set(scope, [...(byScope.get(scope) ?? []), verb]);
	}
	return [...byScope.entries()]
		.map(([scope, verbs]) =>
			scope ? `${verbs.join(", ")} on ${scope}` : `${verbs.join(", ")} on all buckets`,
		)
		.join("; ");
}

/** "2 users, 1 group" or "Unused". */
export function describeUsage(policy: IamPolicy): string {
	const { users, groups } = policy.attachedTo;
	const parts = [
		users.length ? `${users.length} ${users.length === 1 ? "user" : "users"}` : "",
		groups.length ? `${groups.length} ${groups.length === 1 ? "group" : "groups"}` : "",
	].filter(Boolean);
	return parts.length ? parts.join(", ") : "Unused";
}
