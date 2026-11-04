/** Contract types for Access (IAM): users, access keys, groups, service accounts and policies. */

export type KeyStatus = "Active" | "Inactive";

/** An access key as Kelp shows it. Secrets are never included. */
export interface AccessKeyInfo {
	accessKey: string;
	status: KeyStatus;
	createdAt: string | null;
}

export interface IamUser {
	username: string;
	email: string;
	/** Legacy SeaweedFS actions such as `Read`, `Write:media`, `Admin`. */
	actions: string[];
	/** Managed policies attached directly to the user. */
	policies: string[];
	groups: string[];
	accessKeys: AccessKeyInfo[];
	/** Defined in the S3 config file; SeaweedFS does not allow editing it. */
	isStatic: boolean;
}

/** Returned exactly once, when a key is created. It cannot be read again. */
export interface NewSecret {
	accessKey: string;
	secretKey: string;
}

export interface CreateUserRequest {
	username: string;
	email?: string;
	actions?: string[];
	policies?: string[];
	generateKey?: boolean;
}

export interface CreateUserResponse {
	user: IamUser;
	key: NewSecret | null;
}

export interface UpdateUserRequest {
	email?: string;
	actions?: string[];
	policies?: string[];
}

export interface CreateAccessKeyRequest {
	/** Optional custom pair; both or neither. */
	accessKey?: string;
	secretKey?: string;
}

export interface IamGroup {
	name: string;
	enabled: boolean;
	members: string[];
	policies: string[];
}

export interface ServiceAccount {
	id: string;
	parentUser: string;
	description: string;
	accessKey: string;
	status: KeyStatus;
	createdAt: string | null;
	expiresAt: string | null;
}

export interface CreateServiceAccountRequest {
	parentUser: string;
	description?: string;
	/** ISO timestamp; omit for no expiry. */
	expiresAt?: string;
}

export interface CreateServiceAccountResponse {
	account: ServiceAccount;
	key: NewSecret;
}

export interface UpdateServiceAccountRequest {
	description?: string;
	status?: KeyStatus;
	expiresAt?: string;
}

/** An IAM policy document. Kept as JSON so every valid AWS shape round-trips. */
export interface PolicyDocument {
	Version: string;
	Statement: Array<Record<string, unknown>>;
	[key: string]: unknown;
}

export interface IamPolicy {
	name: string;
	document: PolicyDocument;
	statementCount: number;
	createdAt: string | null;
	updatedAt: string | null;
	/** Who uses this policy, derived from users and groups. */
	attachedTo: { users: string[]; groups: string[] };
}

export interface PolicyValidation {
	valid: boolean;
	message: string;
}
