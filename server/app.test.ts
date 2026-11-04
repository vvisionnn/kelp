import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { z } from "zod";
import { testConfig } from "../test/server-helpers.ts";
import { createApp, type Env } from "./app.ts";
import { UpstreamError } from "./upstream/http.ts";

let staticDir: string;
beforeAll(async () => {
	staticDir = await mkdtemp(join(tmpdir(), "kelp-static-"));
	await writeFile(join(staticDir, "index.html"), "<!doctype html><title>Kelp</title>");
	await writeFile(join(staticDir, "app.js"), "console.log('kelp')");
});
afterAll(() => rm(staticDir, { recursive: true, force: true }));

function makeApp() {
	const probe = new Hono<Env>()
		.get("/ok", (c) => c.json({ ok: true }))
		.post("/write", (c) => c.json({ wrote: true }))
		.get("/upstream", () => {
			throw new UpstreamError("master", 503, "master is down");
		})
		.get("/invalid", () => {
			z.object({ a: z.string() }).parse({});
			return new Response();
		})
		.get("/boom", () => {
			throw new Error("secret internals");
		});
	return createApp({ config: testConfig({ staticDir }), routes: [["/probe", probe]] });
}

async function login(app: ReturnType<typeof makeApp>, name = "admin", password = "admin-pass") {
	const response = await app.request("/api/auth/login", {
		method: "POST",
		headers: { "content-type": "application/json", "x-kelp-csrf": "1" },
		body: JSON.stringify({ username: name, password }),
	});
	return { response, cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "" };
}

describe("auth endpoints", () => {
	test("login sets an HttpOnly session cookie and returns the user", async () => {
		const { response } = await login(makeApp());
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ user: { name: "admin", role: "admin" } });
		const cookie = response.headers.get("set-cookie") ?? "";
		expect(cookie).toContain("kelp_session=");
		expect(cookie).toContain("HttpOnly");
		expect(cookie).toContain("SameSite=Lax");
		expect(cookie).not.toContain("Secure");
	});

	test("marks the cookie Secure behind an HTTPS proxy", async () => {
		const response = await makeApp().request("/api/auth/login", {
			method: "POST",
			headers: { "content-type": "application/json", "x-kelp-csrf": "1", "x-forwarded-proto": "https" },
			body: JSON.stringify({ username: "admin", password: "admin-pass" }),
		});
		expect(response.headers.get("set-cookie")).toContain("Secure");
	});

	test("rejects bad credentials with 401 and throttles repeated failures", async () => {
		const app = makeApp();
		for (let i = 0; i < 10; i++) {
			expect((await login(app, "admin", "nope")).response.status).toBe(401);
		}
		const blocked = await login(app, "admin", "admin-pass");
		expect(blocked.response.status).toBe(429);
	});

	test("rejects malformed login bodies", async () => {
		const response = await makeApp().request("/api/auth/login", {
			method: "POST",
			headers: { "content-type": "application/json", "x-kelp-csrf": "1" },
			body: JSON.stringify({ username: 1 }),
		});
		expect(response.status).toBe(400);
	});

	test("me returns the session user or 401", async () => {
		const app = makeApp();
		expect((await app.request("/api/auth/me")).status).toBe(401);
		const { cookie } = await login(app, "viewer", "viewer-pass");
		const me = await app.request("/api/auth/me", { headers: { cookie } });
		expect(await me.json()).toEqual({ user: { name: "viewer", role: "viewer" } });
	});

	test("logout clears the cookie", async () => {
		const app = makeApp();
		const { cookie } = await login(app);
		const response = await app.request("/api/auth/logout", {
			method: "POST",
			headers: { cookie, "x-kelp-csrf": "1" },
		});
		expect(response.status).toBe(200);
		expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
	});
});

describe("protection", () => {
	test("API routes require a session", async () => {
		const response = await makeApp().request("/api/probe/ok");
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "Sign in to continue" });
	});

	test("viewers can read but not write", async () => {
		const app = makeApp();
		const { cookie } = await login(app, "viewer", "viewer-pass");
		expect((await app.request("/api/probe/ok", { headers: { cookie } })).status).toBe(200);
		const write = await app.request("/api/probe/write", {
			method: "POST",
			headers: { cookie, "x-kelp-csrf": "1" },
		});
		expect(write.status).toBe(403);
		expect(await write.json()).toEqual({ error: "Your account is read-only" });
	});

	test("writes require the CSRF header", async () => {
		const app = makeApp();
		const { cookie } = await login(app);
		const missing = await app.request("/api/probe/write", { method: "POST", headers: { cookie } });
		expect(missing.status).toBe(403);
		const ok = await app.request("/api/probe/write", {
			method: "POST",
			headers: { cookie, "x-kelp-csrf": "1" },
		});
		expect(ok.status).toBe(200);
	});

	test("login itself requires the CSRF header", async () => {
		const response = await makeApp().request("/api/auth/login", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ username: "admin", password: "admin-pass" }),
		});
		expect(response.status).toBe(403);
	});
});

describe("errors", () => {
	test("maps upstream failures to their status with the component name", async () => {
		const app = makeApp();
		const { cookie } = await login(app);
		const response = await app.request("/api/probe/upstream", { headers: { cookie } });
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: "master is down", upstream: "master" });
	});

	test("maps validation failures to 400", async () => {
		const app = makeApp();
		const { cookie } = await login(app);
		const response = await app.request("/api/probe/invalid", { headers: { cookie } });
		expect(response.status).toBe(400);
		expect((await response.json()).error).toContain("a");
	});

	test("hides unexpected errors behind a generic 500", async () => {
		const app = makeApp();
		const { cookie } = await login(app);
		const response = await app.request("/api/probe/boom", { headers: { cookie } });
		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ error: "Something went wrong in Kelp. Check the server logs." });
	});

	test("unknown API routes return 404 JSON", async () => {
		const app = makeApp();
		const { cookie } = await login(app);
		const response = await app.request("/api/nope", { headers: { cookie } });
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "Not found" });
	});
});

describe("static UI", () => {
	test("serves the health check without a session", async () => {
		const response = await makeApp().request("/api/health");
		expect(await response.json()).toEqual({ ok: true });
	});

	test("serves built assets and falls back to index.html for client routes", async () => {
		const app = makeApp();
		expect(await (await app.request("/app.js")).text()).toContain("kelp");
		const page = await app.request("/buckets/media");
		expect(page.headers.get("content-type")).toContain("text/html");
		expect(await page.text()).toContain("<title>Kelp</title>");
	});
});
