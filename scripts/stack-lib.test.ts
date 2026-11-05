import { afterEach, expect, test } from "bun:test";
import { kelpEnv, PORTS, stackPorts, waitFor, waitForHttp } from "./stack-lib.ts";

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

test("offset ports shift every service and feed the Kelp environment", () => {
	expect(stackPorts()).toEqual({ ...PORTS });
	const ports = stackPorts(100);
	expect(ports).toEqual({
		master: 9433,
		volume: 8180,
		filer: 8988,
		s3: 8433,
		iceberg: 8281,
		broker: 17877,
		admin: 12635,
		metrics: 9427,
		adminMetrics: 9428,
	});
	expect(kelpEnv(ports)).toEqual({
		KELP_ADMIN_URL: "http://127.0.0.1:12635",
		KELP_MASTER_URL: "http://127.0.0.1:9433",
		KELP_FILER_URL: "http://127.0.0.1:8988",
		KELP_S3_ENDPOINT: "http://127.0.0.1:8433",
		KELP_METRICS_URLS: "http://127.0.0.1:9427/metrics,http://127.0.0.1:9428/metrics",
	});
});

test("waitFor treats thrown checks as not ready and gives up at the deadline", async () => {
	let calls = 0;
	expect(
		await waitFor(
			async () => {
				calls++;
				if (calls === 1) throw new Error("not yet");
				return calls === 3;
			},
			{ intervalMs: 1 },
		),
	).toBe(true);
	expect(await waitFor(async () => false, { timeoutMs: 20, intervalMs: 5 })).toBe(false);
});
