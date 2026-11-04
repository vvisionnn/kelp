import { afterEach, describe, expect, test } from "bun:test";
import { KelpApiError, KelpClient } from "./kelp-client.ts";

let server: ReturnType<typeof Bun.serve> | undefined;
afterEach(() => server?.stop(true));

function serve(handler: (request: Request) => Response | Promise<Response>) {
	server = Bun.serve({ port: 0, fetch: handler });
	return new KelpClient(`http://127.0.0.1:${server.port}`);
}

describe("KelpClient", () => {
	test("signs in once and sends the session and CSRF header on every call", async () => {
		const seen: Array<{ cookie: string | null; csrf: string | null; body: string }> = [];
		const client = serve(async (request) => {
			const url = new URL(request.url);
			if (url.pathname === "/api/auth/login") {
				return Response.json({}, { headers: { "set-cookie": "kelp_session=abc; HttpOnly" } });
			}
			seen.push({
				cookie: request.headers.get("cookie"),
				csrf: request.headers.get("x-kelp-csrf"),
				body: await request.text(),
			});
			return url.pathname === "/api/empty" ? new Response("") : Response.json({ ok: url.pathname });
		});
		await client.signIn("admin", "pw");
		expect(await client.get("/one")).toEqual({ ok: "/api/one" });
		expect(await client.post("/two", { a: 1 })).toEqual({ ok: "/api/two" });
		expect(await client.put("/three")).toEqual({ ok: "/api/three" });
		expect(await client.get("/empty")).toBeNull();
		expect(seen[0]).toEqual({ cookie: "kelp_session=abc", csrf: "1", body: "" });
		expect(seen[1]?.body).toBe('{"a":1}');
	});

	test("reports sign-in failures and API errors with their message", async () => {
		const client = serve((request) => {
			const path = new URL(request.url).pathname;
			if (path === "/api/auth/login") return new Response("no", { status: 401 });
			if (path === "/api/text") return new Response("plain failure", { status: 500 });
			return Response.json({ error: "Bucket media already exists" }, { status: 409 });
		});
		await expect(client.signIn("admin", "bad")).rejects.toThrow("Sign-in failed (401)");
		await expect(client.get("/text")).rejects.toThrow("GET /text: plain failure");
		const error = await client.post("/buckets").catch((e: unknown) => e);
		expect(error).toBeInstanceOf(KelpApiError);
		expect((error as KelpApiError).status).toBe(409);
	});

	test("ensure tolerates existing resources but not other failures", async () => {
		const client = serve((request) =>
			new URL(request.url).pathname === "/api/exists"
				? Response.json({ error: "exists" }, { status: 409 })
				: Response.json({ error: "boom" }, { status: 500 }),
		);
		expect(await client.ensure(() => client.post("/exists"))).toBeUndefined();
		expect(await client.ensure(async () => 5)).toBe(5);
		await expect(client.ensure(() => client.post("/fails"))).rejects.toThrow("boom");
	});
});
