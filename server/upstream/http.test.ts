import { afterEach, describe, expect, test } from "bun:test";
import { HttpUpstream, UpstreamError } from "./http.ts";

let server: ReturnType<typeof Bun.serve> | undefined;
afterEach(() => server?.stop(true));

function serve(handler: (req: Request) => Response | Promise<Response>) {
	server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: handler });
	return `http://127.0.0.1:${server.port}`;
}

describe("HttpUpstream", () => {
	test("GETs JSON relative to the base URL with query parameters", async () => {
		const base = serve((req) => {
			const url = new URL(req.url);
			return Response.json({ path: url.pathname, q: url.searchParams.get("q") });
		});
		const up = new HttpUpstream("admin", `${base}/api/`);
		expect(await up.json("s3/buckets", { query: { q: "a b", skip: undefined } })).toEqual({
			path: "/api/s3/buckets",
			q: "a b",
		});
	});

	test("sends JSON bodies with the right content type", async () => {
		const base = serve(async (req) =>
			Response.json({ method: req.method, type: req.headers.get("content-type"), body: await req.json() }),
		);
		const up = new HttpUpstream("admin", base);
		expect(await up.json("/x", { method: "PUT", body: { a: 1 } })).toEqual({
			method: "PUT",
			type: "application/json",
			body: { a: 1 },
		});
	});

	test("maps error responses to UpstreamError with the upstream message", async () => {
		const base = serve(() => Response.json({ error: "bucket exists" }, { status: 409 }));
		const error = await new HttpUpstream("admin", base).json("/b").catch((e: unknown) => e);
		expect(error).toBeInstanceOf(UpstreamError);
		expect(error).toMatchObject({ status: 409, upstream: "admin", message: "bucket exists" });
	});

	test("uses plain-text error bodies and falls back to the status text", async () => {
		const base = serve((req) =>
			new URL(req.url).pathname === "/text"
				? new Response("volume not found\n", { status: 404 })
				: new Response(null, { status: 500 }),
		);
		const up = new HttpUpstream("master", base);
		await expect(up.json("/text")).rejects.toMatchObject({ status: 404, message: "volume not found" });
		await expect(up.json("/empty")).rejects.toMatchObject({ status: 500, message: "master returned 500" });
	});

	test("reports unreachable upstreams as 502", async () => {
		const up = new HttpUpstream("filer", "http://127.0.0.1:1");
		await expect(up.json("/")).rejects.toMatchObject({ status: 502, upstream: "filer" });
	});

	test("times out slow upstreams as 504", async () => {
		const base = serve(() => new Promise<Response>(() => {}));
		const up = new HttpUpstream("admin", base, { timeoutMs: 30 });
		await expect(up.json("/slow")).rejects.toMatchObject({
			status: 504,
			message: "admin did not respond in time",
		});
	});

	test("returns empty successful bodies as null", async () => {
		const base = serve(() => new Response(null, { status: 204 }));
		expect(await new HttpUpstream("admin", base).json("/x", { method: "DELETE" })).toBeNull();
	});

	test("exposes raw responses for streaming", async () => {
		const base = serve(() => new Response("stream-data", { headers: { "content-type": "text/plain" } }));
		const response = await new HttpUpstream("filer", base).raw("/file");
		expect(await response.text()).toBe("stream-data");
	});
});
