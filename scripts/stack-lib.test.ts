import { afterEach, expect, test } from "bun:test";
import { waitForHttp } from "./stack-lib.ts";

let server: ReturnType<typeof Bun.serve> | undefined;
afterEach(() => server?.stop(true));

test("resolves true once the endpoint answers below 500", async () => {
	let calls = 0;
	server = Bun.serve({
		port: 0,
		fetch: () => (++calls < 3 ? new Response("starting", { status: 503 }) : new Response("ok")),
	});
	expect(await waitForHttp(`http://127.0.0.1:${server.port}/`, { intervalMs: 1 })).toBe(true);
	expect(calls).toBe(3);
});

test("resolves false when nothing answers before the deadline", async () => {
	expect(await waitForHttp("http://127.0.0.1:1/", { timeoutMs: 50, intervalMs: 10 })).toBe(false);
});
