import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { ApiError, api, UNAUTHORIZED_EVENT } from "./api.ts";

const realFetch = globalThis.fetch;
let calls: Array<{ url: string; init: RequestInit }>;

function respond(body: unknown, status = 200) {
	globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
		calls.push({ url: String(url), init: init ?? {} });
		return new Response(body === undefined ? null : JSON.stringify(body), {
			status,
			headers: { "content-type": "application/json" },
		});
	}) as unknown as typeof fetch;
}

beforeEach(() => {
	calls = [];
});
afterEach(() => {
	globalThis.fetch = realFetch;
});

describe("api", () => {
	test("GETs JSON with query parameters and same-origin credentials", async () => {
		respond({ ok: true });
		expect(await api.get("/files", { path: "/buckets", cursor: undefined, limit: 50 })).toEqual({ ok: true });
		expect(calls[0]?.url).toBe("/api/files?path=%2Fbuckets&limit=50");
		expect(calls[0]?.init.credentials).toBe("same-origin");
	});

	test("sends JSON bodies with the CSRF header", async () => {
		respond({ created: true });
		await api.post("/buckets", { name: "media" });
		const headers = new Headers(calls[0]?.init.headers);
		expect(calls[0]?.init.method).toBe("POST");
		expect(headers.get("x-kelp-csrf")).toBe("1");
		expect(headers.get("content-type")).toBe("application/json");
		expect(calls[0]?.init.body).toBe('{"name":"media"}');
	});

	test("supports PUT and DELETE, and empty responses", async () => {
		respond(undefined, 204);
		expect(await api.put("/x", { a: 1 })).toBeNull();
		expect(await api.delete("/x", { recursive: true })).toBeNull();
		expect(calls.map((c) => c.init.method)).toEqual(["PUT", "DELETE"]);
		expect(calls[1]?.init.body).toBe('{"recursive":true}');
	});

	test("raises ApiError with the server message and failing component", async () => {
		respond({ error: "bucket exists", upstream: "admin" }, 409);
		const error = await api.post("/buckets", {}).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(ApiError);
		expect(error).toMatchObject({ status: 409, message: "bucket exists", upstream: "admin" });
	});

	test("falls back to a generic message for non-JSON errors", async () => {
		globalThis.fetch = mock(
			async () => new Response("<html>bad gateway</html>", { status: 502 }),
		) as unknown as typeof fetch;
		await expect(api.get("/x")).rejects.toMatchObject({ status: 502, message: "Request failed (502)" });
	});

	test("reports network failures as status 0", async () => {
		globalThis.fetch = mock(async () => {
			throw new TypeError("Failed to fetch");
		}) as unknown as typeof fetch;
		await expect(api.get("/x")).rejects.toMatchObject({ status: 0, message: "Kelp server is unreachable" });
	});

	test("broadcasts 401s so the app can return to sign-in", async () => {
		respond({ error: "Sign in to continue" }, 401);
		const listener = mock(() => {});
		window.addEventListener(UNAUTHORIZED_EVENT, listener);
		await api.get("/overview").catch(() => {});
		window.removeEventListener(UNAUTHORIZED_EVENT, listener);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	test("a 401 from the auth endpoints is an answer, not an expired session", async () => {
		respond({ error: "Sign in to continue" }, 401);
		const listener = mock(() => {});
		window.addEventListener(UNAUTHORIZED_EVENT, listener);
		await api.get("/auth/me").catch(() => {});
		await api.post("/auth/login", {}).catch(() => {});
		window.removeEventListener(UNAUTHORIZED_EVENT, listener);
		expect(listener).not.toHaveBeenCalled();
	});
});
