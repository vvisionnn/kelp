import { Hono } from "hono";
import { z } from "zod";
import type {
	CreateServiceAccountResponse,
	CreateUserResponse,
	IamGroup,
	IamPolicy,
	IamUser,
	PolicyValidation,
	ServiceAccount,
} from "../../shared/iam.ts";
import type { Env } from "../app.ts";
import {
	cleanIamError,
	mapAccessKey,
	mapGroup,
	mapPolicy,
	mapServiceAccount,
	mapUserDetail,
	mapUserSummary,
	newSecret,
	policyAttachments,
} from "../map/iam.ts";
import { list, obj, type Raw, str, strings } from "../map/raw.ts";
import type { Services } from "../services.ts";
import { type RequestOptions, UpstreamError } from "../upstream/http.ts";

const name = z.string().trim().min(1).max(128);
const keyStatus = z.enum(["Active", "Inactive"]);
const policyDocument = z
	.object({ Version: z.string(), Statement: z.array(z.record(z.string(), z.unknown())) })
	.catchall(z.unknown());

const createUser = z.object({
	username: name.regex(/^[\w.@+=,-]+$/, "Use letters, numbers and + = , . @ _ - only"),
	email: z.string().trim().email().or(z.literal("")).optional(),
	actions: z.array(z.string().min(1)).optional(),
	policies: z.array(z.string().min(1)).optional(),
	generateKey: z.boolean().optional(),
});
const updateUser = z.object({
	email: z.string().trim().email().or(z.literal("")).optional(),
	actions: z.array(z.string().min(1)).optional(),
	policies: z.array(z.string().min(1)).optional(),
});
const createKey = z
	.object({ accessKey: z.string().trim().min(1).optional(), secretKey: z.string().min(1).optional() })
	.refine(
		(v) => Boolean(v.accessKey) === Boolean(v.secretKey),
		"Provide both an access key and a secret, or neither",
	);
const createServiceAccount = z.object({
	parentUser: name,
	description: z.string().trim().max(256).optional(),
	expiresAt: z.iso.datetime({ offset: true }).optional(),
});
const updateServiceAccount = z.object({
	description: z.string().trim().max(256).optional(),
	status: keyStatus.optional(),
	expiresAt: z.iso.datetime({ offset: true }).optional(),
});

/** Runs `task` over `items` with at most `limit` in flight. */
async function mapLimit<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (next < items.length) {
			const index = next++;
			results[index] = await task(items[index] as T);
		}
	});
	await Promise.all(workers);
	return results;
}

const seg = (value: string) => encodeURIComponent(value);

/**
 * Access management on top of the native admin API. Every secret the admin returns is dropped here;
 * the only secrets Kelp ever sends are the one-time values from creating a key or service account.
 */
export function iamRoutes({ admin }: Services) {
	/** Calls the admin API and rewrites its layered errors into plain sentences. */
	async function call<T = Raw>(path: string, options: RequestOptions = {}): Promise<T> {
		try {
			return await admin.json<T>(path, options);
		} catch (error) {
			if (!(error instanceof UpstreamError)) throw error;
			const message = cleanIamError(error.message);
			const status = /already exists/i.test(message) ? 409 : error.status;
			throw new UpstreamError(error.upstream, status, message);
		}
	}

	async function loadUsers(): Promise<IamUser[]> {
		const summaries = list((await call("users")).users);
		return mapLimit(summaries, 8, async (raw) => {
			const summary = mapUserSummary(raw);
			try {
				const detail = await call(`users/${seg(summary.username)}`);
				return mapUserDetail({ ...detail, username: summary.username }, summary.isStatic);
			} catch {
				return summary;
			}
		});
	}

	async function loadUser(username: string): Promise<IamUser> {
		const [detail, users] = await Promise.all([call(`users/${seg(username)}`), call("users")]);
		const isStatic = list(users.users).some((u) => str(u.username) === username && u.is_static === true);
		return mapUserDetail(detail, isStatic);
	}

	const loadGroups = async (): Promise<IamGroup[]> => list((await call("groups")).groups).map(mapGroup);

	return (
		new Hono<Env>()
			// ------------------------------------------------------------------ users
			.get("/iam/users", async (c) => c.json({ users: await loadUsers() }))
			.post("/iam/users", async (c) => {
				const body = createUser.parse(await c.req.json());
				const created = obj(
					(
						await call("users", {
							method: "POST",
							body: {
								username: body.username,
								email: body.email ?? "",
								actions: body.actions ?? [],
								policy_names: body.policies ?? [],
								generate_key: body.generateKey ?? false,
							},
						})
					).user,
				);
				const response: CreateUserResponse = {
					user: await loadUser(body.username),
					key: newSecret(created.access_key, created.secret_key),
				};
				return c.json(response, 201);
			})
			.get("/iam/users/:username", async (c) => c.json({ user: await loadUser(c.req.param("username")) }))
			.put("/iam/users/:username", async (c) => {
				const username = c.req.param("username");
				const body = updateUser.parse(await c.req.json());
				await call(`users/${seg(username)}`, {
					method: "PUT",
					body: {
						email: body.email ?? "",
						...(body.actions ? { actions: body.actions } : {}),
						...(body.policies ? { policy_names: body.policies } : {}),
					},
				});
				return c.json({ user: await loadUser(username) });
			})
			.delete("/iam/users/:username", async (c) => {
				await call(`users/${seg(c.req.param("username"))}`, { method: "DELETE" });
				return c.json({ ok: true });
			})
			.post("/iam/users/:username/keys", async (c) => {
				const body = createKey.parse(await c.req.json().catch(() => ({})));
				const created = await call(`users/${seg(c.req.param("username"))}/access-keys`, {
					method: "POST",
					...(body.accessKey ? { body: { access_key: body.accessKey, secret_key: body.secretKey } } : {}),
				});
				const raw = obj(created.access_key);
				return c.json({ accessKey: mapAccessKey(raw), key: newSecret(raw.access_key, raw.secret_key) }, 201);
			})
			.put("/iam/users/:username/keys/:accessKey", async (c) => {
				const { status } = z.object({ status: keyStatus }).parse(await c.req.json());
				await call(
					`users/${seg(c.req.param("username"))}/access-keys/${seg(c.req.param("accessKey"))}/status`,
					{
						method: "PUT",
						body: { status },
					},
				);
				return c.json({ ok: true });
			})
			.delete("/iam/users/:username/keys/:accessKey", async (c) => {
				await call(`users/${seg(c.req.param("username"))}/access-keys/${seg(c.req.param("accessKey"))}`, {
					method: "DELETE",
				});
				return c.json({ ok: true });
			})
			// ------------------------------------------------------------------ groups
			.get("/iam/groups", async (c) => c.json({ groups: await loadGroups() }))
			.post("/iam/groups", async (c) => {
				const body = z.object({ name }).parse(await c.req.json());
				const group = mapGroup(await call("groups", { method: "POST", body: { name: body.name } }));
				return c.json({ group }, 201);
			})
			.get("/iam/groups/:name", async (c) =>
				c.json({ group: mapGroup(await call(`groups/${seg(c.req.param("name"))}`)) }),
			)
			.delete("/iam/groups/:name", async (c) => {
				await call(`groups/${seg(c.req.param("name"))}`, { method: "DELETE" });
				return c.json({ ok: true });
			})
			.put("/iam/groups/:name/status", async (c) => {
				const body = z.object({ enabled: z.boolean() }).parse(await c.req.json());
				await call(`groups/${seg(c.req.param("name"))}/status`, { method: "PUT", body });
				return c.json({ ok: true });
			})
			.post("/iam/groups/:name/members", async (c) => {
				const body = z.object({ username: name }).parse(await c.req.json());
				await call(`groups/${seg(c.req.param("name"))}/members`, { method: "POST", body });
				return c.json({ ok: true });
			})
			.delete("/iam/groups/:name/members/:username", async (c) => {
				await call(`groups/${seg(c.req.param("name"))}/members/${seg(c.req.param("username"))}`, {
					method: "DELETE",
				});
				return c.json({ ok: true });
			})
			.post("/iam/groups/:name/policies", async (c) => {
				const body = z.object({ policy: name }).parse(await c.req.json());
				await call(`groups/${seg(c.req.param("name"))}/policies`, {
					method: "POST",
					body: { policy_name: body.policy },
				});
				return c.json({ ok: true });
			})
			.delete("/iam/groups/:name/policies/:policy", async (c) => {
				await call(`groups/${seg(c.req.param("name"))}/policies/${seg(c.req.param("policy"))}`, {
					method: "DELETE",
				});
				return c.json({ ok: true });
			})
			// ------------------------------------------------------------------ service accounts
			.get("/iam/service-accounts", async (c) => {
				const accounts: ServiceAccount[] = list((await call("service-accounts")).service_accounts).map(
					mapServiceAccount,
				);
				return c.json({ serviceAccounts: accounts });
			})
			.post("/iam/service-accounts", async (c) => {
				const body = createServiceAccount.parse(await c.req.json());
				const created = obj(
					(
						await call("service-accounts", {
							method: "POST",
							body: {
								parent_user: body.parentUser,
								description: body.description ?? "",
								...(body.expiresAt ? { expiration: new Date(body.expiresAt).toISOString() } : {}),
							},
						})
					).service_account,
				);
				const key = newSecret(created.access_key_id, created.secret_access_key);
				if (!key) throw new UpstreamError("admin", 502, "SeaweedFS did not return the new credentials");
				const response: CreateServiceAccountResponse = { account: mapServiceAccount(created), key };
				return c.json(response, 201);
			})
			.get("/iam/service-accounts/:id", async (c) =>
				c.json({
					serviceAccount: mapServiceAccount(await call(`service-accounts/${seg(c.req.param("id"))}`)),
				}),
			)
			.put("/iam/service-accounts/:id", async (c) => {
				const body = updateServiceAccount.parse(await c.req.json());
				const updated = await call(`service-accounts/${seg(c.req.param("id"))}`, {
					method: "PUT",
					body: {
						...(body.description !== undefined ? { description: body.description } : {}),
						...(body.status ? { status: body.status } : {}),
						...(body.expiresAt ? { expiration: new Date(body.expiresAt).toISOString() } : {}),
					},
				});
				return c.json({ serviceAccount: mapServiceAccount(obj(updated.service_account)) });
			})
			.delete("/iam/service-accounts/:id", async (c) => {
				await call(`service-accounts/${seg(c.req.param("id"))}`, { method: "DELETE" });
				return c.json({ ok: true });
			})
			// ------------------------------------------------------------------ policies
			.get("/iam/policies", async (c) => {
				const [raw, users, groups] = await Promise.all([
					call("object-store/policies"),
					loadUsers(),
					loadGroups(),
				]);
				const attachments = policyAttachments(users, groups);
				const policies: IamPolicy[] = list(raw.policies).map((p) =>
					mapPolicy(p, attachments.get(str(p.name))),
				);
				return c.json({ policies });
			})
			.post("/iam/policies", async (c) => {
				const body = z.object({ name, document: policyDocument }).parse(await c.req.json());
				await call("object-store/policies", { method: "POST", body });
				return c.json({ policy: mapPolicy(await call(`object-store/policies/${seg(body.name)}`)) }, 201);
			})
			.post("/iam/policies/validate", async (c) => {
				const { document } = z.object({ document: z.unknown() }).parse(await c.req.json());
				try {
					const result = await admin.json<Raw>("object-store/policies/validate", {
						method: "POST",
						body: { document },
					});
					const validation: PolicyValidation = { valid: true, message: str(result.message, "Looks good") };
					return c.json(validation);
				} catch (error) {
					if (error instanceof UpstreamError && error.status === 400) {
						const validation: PolicyValidation = { valid: false, message: cleanIamError(error.message) };
						return c.json(validation);
					}
					throw error;
				}
			})
			.get("/iam/policies/:name", async (c) => {
				const policyName = c.req.param("name");
				const [raw, users, groups] = await Promise.all([
					call(`object-store/policies/${seg(policyName)}`),
					loadUsers(),
					loadGroups(),
				]);
				return c.json({ policy: mapPolicy(raw, policyAttachments(users, groups).get(policyName)) });
			})
			.put("/iam/policies/:name", async (c) => {
				const policyName = c.req.param("name");
				const body = z.object({ document: policyDocument }).parse(await c.req.json());
				await call(`object-store/policies/${seg(policyName)}`, { method: "PUT", body });
				return c.json({ policy: mapPolicy(await call(`object-store/policies/${seg(policyName)}`)) });
			})
			.delete("/iam/policies/:name", async (c) => {
				await call(`object-store/policies/${seg(c.req.param("name"))}`, { method: "DELETE" });
				return c.json({ ok: true });
			})
			.get("/iam/principals", async (c) => {
				const raw = await call("principals");
				return c.json({ principals: strings(raw.principals) });
			})
	);
}
