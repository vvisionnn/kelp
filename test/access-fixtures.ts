import type { IamGroup, IamPolicy, IamUser, ServiceAccount } from "@shared/iam.ts";
import {
	mapGroup,
	mapPolicy,
	mapServiceAccount,
	mapUserDetail,
	policyAttachments,
} from "../server/map/iam.ts";
import type { Raw } from "../server/map/raw.ts";
import { fixture } from "./render-app.tsx";

/** Access API responses built from real SeaweedFS 4.52 fixtures through Kelp's own mappers. */
export async function accessApi() {
	const bob = mapUserDetail(await fixture<Raw>("admin/iam-user-bob"), false);
	const users: IamUser[] = [
		{ ...bob, username: "alice", email: "a@x.io", groups: [], accessKeys: bob.accessKeys.slice(0, 1) },
		bob,
		{
			username: "kelp-dev",
			email: "",
			actions: ["Admin", "Read", "List", "Tagging", "Write"],
			policies: [],
			groups: [],
			accessKeys: [{ accessKey: "kelp-dev-access-key", status: "Active", createdAt: null }],
			isStatic: true,
		},
	];
	const groups: IamGroup[] = ((await fixture<{ groups: Raw[] }>("admin/iam-groups")).groups ?? []).map(
		mapGroup,
	);
	const serviceAccounts: ServiceAccount[] = (
		(await fixture<{ service_accounts: Raw[] }>("admin/iam-service-accounts")).service_accounts ?? []
	).map(mapServiceAccount);
	const attachments = policyAttachments(users, groups);
	const policies: IamPolicy[] = (
		(await fixture<{ policies: Raw[] }>("admin/iam-policies")).policies ?? []
	).map((p) => mapPolicy(p, attachments.get(String(p.name))));
	const principals = (await fixture<{ principals: string[] }>("admin/iam-principals")).principals;
	const [ro] = policies as [IamPolicy];
	return {
		users,
		groups,
		serviceAccounts,
		policies,
		routes: {
			"GET /iam/users": { users },
			"GET /iam/users/bob": { user: bob },
			"GET /iam/users/alice": { user: users[0] },
			"GET /iam/users/kelp-dev": { user: users[2] },
			"GET /iam/groups": { groups },
			"GET /iam/groups/devs": { group: groups[0] },
			"GET /iam/service-accounts": { serviceAccounts },
			"GET /iam/policies": { policies },
			"GET /iam/policies/ro": { policy: ro },
			"GET /iam/principals": { principals },
			"GET /system/config": { kelp: { s3Endpoint: "https://s3.example.com" } },
			"POST /iam/policies/validate": { valid: true, message: "Policy document is valid" },
		} as Record<string, unknown>,
	};
}
