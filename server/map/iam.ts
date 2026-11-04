import type {
	AccessKeyInfo,
	IamGroup,
	IamPolicy,
	IamUser,
	KeyStatus,
	NewSecret,
	PolicyDocument,
	ServiceAccount,
} from "../../shared/iam.ts";
import { list, obj, type Raw, str, strings, time } from "./raw.ts";

/** SeaweedFS stores an empty status for keys created before statuses existed; those are active. */
export const keyStatus = (value: unknown): KeyStatus => (str(value) === "Inactive" ? "Inactive" : "Active");

export function mapAccessKey(raw: Raw): AccessKeyInfo {
	return { accessKey: str(raw.access_key), status: keyStatus(raw.status), createdAt: time(raw.created_at) };
}

/** A user from `GET /api/users/{name}`. The detail view is the only one with every key and group. */
export function mapUserDetail(raw: Raw, isStatic: boolean): IamUser {
	return {
		username: str(raw.username),
		email: str(raw.email),
		actions: strings(raw.actions),
		policies: strings(raw.policy_names),
		groups: strings(raw.groups),
		accessKeys: list(raw.access_keys).map(mapAccessKey),
		isStatic,
	};
}

/** A user from the `GET /api/users` list, which only carries the first key and no groups. */
export function mapUserSummary(raw: Raw): IamUser {
	const accessKey = str(raw.access_key);
	return {
		username: str(raw.username),
		email: str(raw.email),
		actions: strings(raw.permissions),
		policies: strings(raw.policy_names),
		groups: [],
		accessKeys: accessKey ? [{ accessKey, status: "Active", createdAt: null }] : [],
		isStatic: raw.is_static === true,
	};
}

/** The one-time secret from a create response, or null when none was generated. */
export function newSecret(accessKey: unknown, secretKey: unknown): NewSecret | null {
	const key = str(accessKey);
	const secret = str(secretKey);
	return key && secret ? { accessKey: key, secretKey: secret } : null;
}

export function mapGroup(raw: Raw): IamGroup {
	return {
		name: str(raw.name),
		enabled: str(raw.status) !== "disabled",
		members: strings(raw.members),
		policies: strings(raw.policy_names),
	};
}

export function mapServiceAccount(raw: Raw): ServiceAccount {
	return {
		id: str(raw.id),
		parentUser: str(raw.parent_user),
		description: str(raw.description),
		accessKey: str(raw.access_key_id),
		status: keyStatus(raw.status),
		createdAt: time(raw.create_date),
		expiresAt: time(raw.expiration),
	};
}

export function mapPolicyDocument(raw: unknown): PolicyDocument {
	const doc = obj(raw);
	return { ...doc, Version: str(doc.Version), Statement: list(doc.Statement) };
}

export function mapPolicy(
	raw: Raw,
	attachedTo: IamPolicy["attachedTo"] = { users: [], groups: [] },
): IamPolicy {
	const document = mapPolicyDocument(raw.document);
	return {
		name: str(raw.name),
		document,
		statementCount: document.Statement.length,
		createdAt: time(raw.created_at),
		updatedAt: time(raw.updated_at),
		attachedTo,
	};
}

/** Who uses each policy, from users' and groups' attachments. */
export function policyAttachments(
	users: IamUser[],
	groups: IamGroup[],
): Map<string, IamPolicy["attachedTo"]> {
	const result = new Map<string, IamPolicy["attachedTo"]>();
	const entry = (name: string) => {
		let value = result.get(name);
		if (!value) {
			value = { users: [], groups: [] };
			result.set(name, value);
		}
		return value;
	};
	for (const user of users) for (const policy of user.policies) entry(policy).users.push(user.username);
	for (const group of groups) for (const policy of group.policies) entry(policy).groups.push(group.name);
	return result;
}

/**
 * Turns the admin's layered error text ("Failed to create user: failed to create user: rpc error:
 * code = AlreadyExists desc = user alice already exists") into one plain sentence.
 */
export function cleanIamError(message: string): string {
	let text = message.trim();
	const desc = text.lastIndexOf("desc = ");
	if (desc >= 0) text = text.slice(desc + "desc = ".length);
	while (/^failed to [^:]+: /i.test(text)) text = text.replace(/^failed to [^:]+: /i, "");
	const attached = text.match(/^policy (\S+) is still attached to: (.+?): policy is still attached$/);
	if (attached) {
		const holders = (attached[2] ?? "").split(/,\s*/).map((h) => h.replace(":", " "));
		text = `Policy ${attached[1]} is still attached to ${holders.join(", ")}. Detach it first.`;
	}
	text = text.replace(/: invalid input$/, "");
	return text.charAt(0).toUpperCase() + text.slice(1);
}
