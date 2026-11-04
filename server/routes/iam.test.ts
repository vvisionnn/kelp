import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type Harness, harness } from "../../test/harness.ts";

const SECRET = /example-secret|kelp-dev-secret-key|secret_?key|secret_access_key/i;

let h: Harness;

function serveIam(target: Harness) {
	target.admin.fixture("GET /api/users", "admin/iam-users");
	target.admin.fixture("GET /api/users/bob", "admin/iam-user-bob");
	target.admin.fixture("GET /api/users/alice", "admin/user-ci-bot");
	target.admin.fixture("GET /api/users/kelp-dev", "admin/user-ci-bot");
	target.admin.fixture("GET /api/groups", "admin/iam-groups");
	target.admin.fixture("GET /api/groups/devs", "admin/iam-group-devs");
	target.admin.fixture("GET /api/service-accounts", "admin/iam-service-accounts");
	target.admin.fixture("GET /api/object-store/policies", "admin/iam-policies");
	target.admin.fixture("GET /api/object-store/policies/ro", "admin/iam-policy-ro");
	target.admin.fixture("GET /api/principals", "admin/iam-principals");
}

beforeEach(async () => {
	h = await harness();
	serveIam(h);
});
afterEach(() => h.stop());

const sent = (method: string, path: string) => JSON.parse(h.admin.last(method, path)?.body || "null");

describe("users", () => {
	test("the list carries every key, group and policy from the details, and no secrets", async () => {
		const response = await h.get("/iam/users");
		const text = await response.text();
		expect(response.status).toBe(200);
		expect(text).not.toMatch(SECRET);
		const { users } = JSON.parse(text);
		const bob = users.find((u: { username: string }) => u.username === "bob");
		expect(bob).toEqual({
			username: "bob",
			email: "bob@example.com",
			actions: ["Read:media"],
			policies: ["ro"],
			groups: ["devs"],
			accessKeys: [
				{ accessKey: "AKIAKELPEXAMPLE00006", status: "Active", createdAt: expect.any(String) },
				{ accessKey: "AKIAKELPEXAMPLE00001", status: "Inactive", createdAt: expect.any(String) },
			],
			isStatic: false,
		});
		expect(users.find((u: { username: string }) => u.username === "kelp-dev").isStatic).toBe(true);
	});

	test("falls back to the list entry when a user's details cannot be read", async () => {
		h.admin.on("GET /api/users/bob", () => Response.json({ error: "boom" }, { status: 500 }));
		const { body } = await h.json("GET", "/iam/users");
		const bob = body.users.find((u: { username: string }) => u.username === "bob");
		expect(bob.groups).toEqual([]);
		expect(bob.accessKeys).toEqual([{ accessKey: expect.any(String), status: "Active", createdAt: null }]);
		expect(JSON.stringify(body)).not.toMatch(SECRET);
	});

	test("user details without secrets", async () => {
		const response = await h.get("/iam/users/bob");
		const text = await response.text();
		expect(text).not.toMatch(SECRET);
		expect(JSON.parse(text).user.groups).toEqual(["devs"]);
	});

	test("unknown users are a 404 with a plain message", async () => {
		h.admin.on("GET /api/users/nobody", () =>
			Response.json({ error: "User not found: user nobody not found" }, { status: 404 }),
		);
		const { status, body } = await h.json("GET", "/iam/users/nobody");
		expect(status).toBe(404);
		expect(body.error).toBe("User not found: user nobody not found");
	});

	test("creating a user returns its secret exactly once", async () => {
		h.admin.fixture("POST /api/users", "admin/iam-user-create");
		const { status, body } = await h.json("POST", "/iam/users", {
			username: "bob",
			email: "bob@example.com",
			actions: ["Read:media"],
			policies: ["ro"],
			generateKey: true,
		});
		expect(status).toBe(201);
		expect(sent("POST", "/api/users")).toEqual({
			username: "bob",
			email: "bob@example.com",
			actions: ["Read:media"],
			policy_names: ["ro"],
			generate_key: true,
		});
		expect(body.key).toEqual({
			accessKey: expect.stringMatching(/^AKIA/),
			secretKey: expect.stringMatching(/^example-secret/),
		});
		expect(JSON.stringify(body.user)).not.toMatch(SECRET);
	});

	test("creating a user without a key sends defaults and returns no secret", async () => {
		h.admin.on("POST /api/users", { user: { username: "bob", access_key: "", secret_key: "" } });
		const { body } = await h.json("POST", "/iam/users", { username: "bob" });
		expect(sent("POST", "/api/users")).toEqual({
			username: "bob",
			email: "",
			actions: [],
			policy_names: [],
			generate_key: false,
		});
		expect(body.key).toBeNull();
	});

	test("duplicate users are a 409 with a plain message", async () => {
		h.admin.on("POST /api/users", () =>
			Response.json(
				{
					error:
						"Failed to create user: failed to create user: rpc error: code = AlreadyExists desc = user bob already exists",
				},
				{ status: 500 },
			),
		);
		const { status, body } = await h.json("POST", "/iam/users", { username: "bob" });
		expect(status).toBe(409);
		expect(body.error).toBe("User bob already exists");
	});

	test("rejects invalid user input before reaching SeaweedFS", async () => {
		expect((await h.json("POST", "/iam/users", { username: "bad name!" })).status).toBe(400);
		expect((await h.json("POST", "/iam/users", { username: "ok", email: "nope" })).status).toBe(400);
		expect(h.admin.last("POST", "/api/users")).toBeUndefined();
	});

	test("updates only the fields given", async () => {
		h.admin.on("PUT /api/users/bob", { message: "ok" });
		await h.json("PUT", "/iam/users/bob", { policies: [] });
		expect(sent("PUT", "/api/users/bob")).toEqual({ email: "", policy_names: [] });
		const { body } = await h.json("PUT", "/iam/users/bob", { email: "b@x.io", actions: ["Read"] });
		expect(sent("PUT", "/api/users/bob")).toEqual({ email: "b@x.io", actions: ["Read"] });
		expect(body.user.username).toBe("bob");
	});

	test("deletes users", async () => {
		h.admin.on("DELETE /api/users/bob", { message: "ok" });
		expect((await h.json("DELETE", "/iam/users/bob")).body).toEqual({ ok: true });
	});

	test("static users cannot be changed", async () => {
		h.admin.on("DELETE /api/users/kelp-dev", () =>
			Response.json(
				{ error: "Cannot delete static user kelp-dev (loaded from config file)" },
				{ status: 403 },
			),
		);
		const { status, body } = await h.json("DELETE", "/iam/users/kelp-dev");
		expect(status).toBe(403);
		expect(body.error).toBe("Cannot delete static user kelp-dev (loaded from config file)");
	});
});

describe("access keys", () => {
	test("a generated key returns its secret once", async () => {
		h.admin.fixture("POST /api/users/bob/access-keys", "admin/iam-key-create");
		const { status, body } = await h.json("POST", "/iam/users/bob/keys");
		expect(status).toBe(201);
		expect(h.admin.last("POST", "/api/users/bob/access-keys")?.body).toBe("");
		expect(body.accessKey).toMatchObject({ status: "Active" });
		expect(body.key.secretKey).toMatch(/^example-secret/);
	});

	test("a custom key pair is passed through; half a pair is rejected", async () => {
		h.admin.fixture("POST /api/users/bob/access-keys", "admin/iam-key-create");
		await h.json("POST", "/iam/users/bob/keys", { accessKey: "MYKEY", secretKey: "my-long-secret" });
		expect(sent("POST", "/api/users/bob/access-keys")).toEqual({
			access_key: "MYKEY",
			secret_key: "my-long-secret",
		});
		expect((await h.json("POST", "/iam/users/bob/keys", { accessKey: "MYKEY" })).status).toBe(400);
	});

	test("invalid custom keys surface SeaweedFS's reason", async () => {
		h.admin.on("POST /api/users/bob/access-keys", () =>
			Response.json(
				{ error: "SecretAccessKey must be between 8 and 128 characters: invalid input" },
				{ status: 400 },
			),
		);
		const { status, body } = await h.json("POST", "/iam/users/bob/keys", {
			accessKey: "K",
			secretKey: "short",
		});
		expect(status).toBe(400);
		expect(body.error).toBe("SecretAccessKey must be between 8 and 128 characters");
	});

	test("deactivates and deletes keys", async () => {
		h.admin.on("PUT /api/users/bob/access-keys/AK1/status", { message: "ok" });
		h.admin.on("DELETE /api/users/bob/access-keys/AK1", { message: "ok" });
		await h.json("PUT", "/iam/users/bob/keys/AK1", { status: "Inactive" });
		expect(sent("PUT", "/api/users/bob/access-keys/AK1/status")).toEqual({ status: "Inactive" });
		expect((await h.json("PUT", "/iam/users/bob/keys/AK1", { status: "off" })).status).toBe(400);
		expect((await h.json("DELETE", "/iam/users/bob/keys/AK1")).body).toEqual({ ok: true });
	});
});

describe("groups", () => {
	test("lists groups with members and policies", async () => {
		const { body } = await h.json("GET", "/iam/groups");
		expect(body.groups).toEqual([{ name: "devs", enabled: false, members: ["bob"], policies: ["ro"] }]);
		expect((await h.json("GET", "/iam/groups/devs")).body.group.name).toBe("devs");
	});

	test("create, status, members, policies and delete reach the admin API", async () => {
		h.admin.on("POST /api/groups", { name: "ops", status: "enabled", members: null, policy_names: null });
		for (const route of [
			"PUT /api/groups/ops/status",
			"POST /api/groups/ops/members",
			"DELETE /api/groups/ops/members/bob",
			"POST /api/groups/ops/policies",
			"DELETE /api/groups/ops/policies/ro",
			"DELETE /api/groups/ops",
		])
			h.admin.on(route, { message: "ok" });
		const created = await h.json("POST", "/iam/groups", { name: "ops" });
		expect(created).toEqual({
			status: 201,
			body: { group: { name: "ops", enabled: true, members: [], policies: [] } },
		});
		await h.json("PUT", "/iam/groups/ops/status", { enabled: false });
		expect(sent("PUT", "/api/groups/ops/status")).toEqual({ enabled: false });
		await h.json("POST", "/iam/groups/ops/members", { username: "bob" });
		expect(sent("POST", "/api/groups/ops/members")).toEqual({ username: "bob" });
		await h.json("DELETE", "/iam/groups/ops/members/bob");
		await h.json("POST", "/iam/groups/ops/policies", { policy: "ro" });
		expect(sent("POST", "/api/groups/ops/policies")).toEqual({ policy_name: "ro" });
		await h.json("DELETE", "/iam/groups/ops/policies/ro");
		expect((await h.json("DELETE", "/iam/groups/ops")).body).toEqual({ ok: true });
		expect(h.admin.last("DELETE", "/api/groups/ops/members/bob")).toBeTruthy();
		expect(h.admin.last("DELETE", "/api/groups/ops/policies/ro")).toBeTruthy();
	});
});

describe("service accounts", () => {
	test("lists accounts without secrets", async () => {
		const response = await h.get("/iam/service-accounts");
		const text = await response.text();
		expect(text).not.toMatch(SECRET);
		expect(JSON.parse(text).serviceAccounts[0]).toMatchObject({
			parentUser: "alice",
			status: "Inactive",
			expiresAt: expect.any(String),
		});
	});

	test("creating returns the secret once and converts the expiry", async () => {
		h.admin.fixture("POST /api/service-accounts", "admin/iam-sa-create");
		const { status, body } = await h.json("POST", "/iam/service-accounts", {
			parentUser: "bob",
			description: "nightly backups",
			expiresAt: "2027-06-30T00:00:00Z",
		});
		expect(status).toBe(201);
		expect(sent("POST", "/api/service-accounts")).toEqual({
			parent_user: "bob",
			description: "nightly backups",
			expiration: "2027-06-30T00:00:00.000Z",
		});
		expect(body.key.secretKey).toMatch(/^example-secret/);
		expect(JSON.stringify(body.account)).not.toMatch(SECRET);
	});

	test("a create response without credentials is an error", async () => {
		h.admin.on("POST /api/service-accounts", { service_account: { id: "sa:bob:1" } });
		const { status } = await h.json("POST", "/iam/service-accounts", { parentUser: "bob" });
		expect(status).toBe(502);
		expect(sent("POST", "/api/service-accounts")).toEqual({ parent_user: "bob", description: "" });
	});

	test("detail, update and delete", async () => {
		h.admin.fixture("GET /api/service-accounts/sa%3Abob%3A002800232799", "admin/iam-sa-detail");
		h.admin.on("PUT /api/service-accounts/sa%3Abob%3A1", {
			service_account: { id: "sa:bob:1", parent_user: "bob", status: "Inactive", description: "x" },
		});
		h.admin.on("DELETE /api/service-accounts/sa%3Abob%3A1", { message: "ok" });
		const detail = await h.json("GET", "/iam/service-accounts/sa:bob:002800232799");
		expect(detail.body.serviceAccount.parentUser).toBe("bob");
		const updated = await h.json("PUT", "/iam/service-accounts/sa:bob:1", {
			status: "Inactive",
			description: "x",
			expiresAt: "2027-01-01T00:00:00Z",
		});
		expect(sent("PUT", "/api/service-accounts/sa:bob:1")).toEqual({
			status: "Inactive",
			description: "x",
			expiration: "2027-01-01T00:00:00.000Z",
		});
		expect(updated.body.serviceAccount.status).toBe("Inactive");
		await h.json("PUT", "/iam/service-accounts/sa:bob:1", {});
		expect(sent("PUT", "/api/service-accounts/sa:bob:1")).toEqual({});
		expect((await h.json("DELETE", "/iam/service-accounts/sa:bob:1")).body).toEqual({ ok: true });
	});
});

describe("policies", () => {
	test("lists policies with who uses them", async () => {
		const { body } = await h.json("GET", "/iam/policies");
		const ro = body.policies.find((p: { name: string }) => p.name === "ro");
		expect(ro.attachedTo).toEqual({ users: ["bob"], groups: ["devs"] });
		expect(ro.statementCount).toBe(1);
		const other = body.policies.find((p: { name: string }) => p.name !== "ro");
		if (other) expect(other.attachedTo).toEqual({ users: [], groups: [] });
	});

	test("reads one policy", async () => {
		const { body } = await h.json("GET", "/iam/policies/ro");
		expect(body.policy).toMatchObject({ name: "ro", attachedTo: { users: ["bob"], groups: ["devs"] } });
		expect(body.policy.document.Version).toBe("2012-10-17");
	});

	test("creates and updates with the document as-is", async () => {
		const document = {
			Version: "2012-10-17",
			Statement: [{ Effect: "Allow", Action: "s3:GetObject", Resource: "arn:aws:s3:::b/*" }],
		};
		h.admin.on("POST /api/object-store/policies", () => Response.json({ success: true }, { status: 201 }));
		h.admin.on("PUT /api/object-store/policies/ro", { success: true });
		expect((await h.json("POST", "/iam/policies", { name: "ro", document })).status).toBe(201);
		expect(sent("POST", "/api/object-store/policies")).toEqual({ name: "ro", document });
		await h.json("PUT", "/iam/policies/ro", { document });
		expect(sent("PUT", "/api/object-store/policies/ro")).toEqual({ document });
		expect((await h.json("PUT", "/iam/policies/ro", { document: { Version: 1 } })).status).toBe(400);
	});

	test("deleting an attached policy explains who still uses it", async () => {
		h.admin.on("DELETE /api/object-store/policies/ro", () =>
			Response.json(
				{
					error:
						"Failed to delete policy: policy ro is still attached to: user:bob, group:devs: policy is still attached",
				},
				{ status: 409 },
			),
		);
		const { status, body } = await h.json("DELETE", "/iam/policies/ro");
		expect(status).toBe(409);
		expect(body.error).toBe("Policy ro is still attached to user bob, group devs. Detach it first.");
		h.admin.on("DELETE /api/object-store/policies/ro", { message: "ok" });
		expect((await h.json("DELETE", "/iam/policies/ro")).body).toEqual({ ok: true });
	});

	test("validation answers valid or explains the first problem", async () => {
		h.admin.on("POST /api/object-store/policies/validate", {
			message: "Policy document is valid",
			valid: true,
		});
		expect((await h.json("POST", "/iam/policies/validate", { document: {} })).body).toEqual({
			valid: true,
			message: "Policy document is valid",
		});
		h.admin.on("POST /api/object-store/policies/validate", () =>
			Response.json({ error: "Statement 1: Effect must be 'Allow' or 'Deny'" }, { status: 400 }),
		);
		expect((await h.json("POST", "/iam/policies/validate", { document: {} })).body).toEqual({
			valid: false,
			message: "Statement 1: Effect must be 'Allow' or 'Deny'",
		});
		h.admin.on("POST /api/object-store/policies/validate", () => new Response("down", { status: 503 }));
		expect((await h.json("POST", "/iam/policies/validate", { document: {} })).status).toBe(503);
	});

	test("principal suggestions", async () => {
		const { body } = await h.json("GET", "/iam/principals");
		expect(body.principals).toContain("arn:aws:iam::000000000000:user/bob");
	});
});

describe("viewers", () => {
	test("can read without secrets but cannot change anything", async () => {
		const viewer = await harness({ role: "viewer" });
		serveIam(viewer);
		try {
			const text = await (await viewer.get("/iam/users")).text();
			expect(text).not.toMatch(SECRET);
			expect((await viewer.json("POST", "/iam/users", { username: "eve" })).status).toBe(403);
			expect((await viewer.json("POST", "/iam/users/bob/keys")).status).toBe(403);
			expect(viewer.admin.last("POST", "/api/users")).toBeUndefined();
		} finally {
			await viewer.stop();
		}
	});
});

describe("errors that are not from SeaweedFS", () => {
	test("pass through untouched", async () => {
		const { status } = await h.json("POST", "/iam/groups", { name: "" });
		expect(status).toBe(400);
	});
});
