import { createApp } from "../server/app.ts";
import { apiRoutes } from "../server/routes/index.ts";
import type { Services } from "../server/services.ts";
import type { ClusterGrpc } from "../server/upstream/grpc.ts";
import { HttpUpstream } from "../server/upstream/http.ts";
import { FakeUpstream } from "./fake-upstream.ts";
import { testConfig } from "./server-helpers.ts";

export interface FakeGrpc extends ClusterGrpc {
	nodes: Record<"filer" | "s3" | "broker", Awaited<ReturnType<ClusterGrpc["listClusterNodes"]>>>;
	mounts: Awaited<ReturnType<ClusterGrpc["listMountClients"]>>;
	topics: Awaited<ReturnType<ClusterGrpc["listTopics"]>>;
	failing: boolean;
	calls: string[];
}

export function fakeGrpc(): FakeGrpc {
	const fake: FakeGrpc = {
		nodes: {
			filer: [{ address: "127.0.0.1:18888", version: "4.52", dataCenter: "", rack: "", createdAt: null }],
			s3: [{ address: "127.0.0.1:18333", version: "4.52", dataCenter: "", rack: "", createdAt: null }],
			broker: [],
		},
		mounts: [],
		topics: [],
		failing: false,
		calls: [],
		async listClusterNodes(type) {
			fake.calls.push(`nodes:${type}`);
			if (fake.failing) throw new Error("grpc down");
			return fake.nodes[type];
		},
		async listMountClients(filers) {
			fake.calls.push(`mounts:${filers.map((f) => f.grpc).join(",")}`);
			return fake.mounts;
		},
		async listTopics(broker) {
			fake.calls.push(`topics:${broker}`);
			return fake.topics;
		},
		close() {},
	};
	return fake;
}

/** A full Kelp app wired to fake SeaweedFS components, plus a signed-in request helper. */
export async function harness(options: { role?: "admin" | "viewer" } = {}) {
	const admin = new FakeUpstream();
	const master = new FakeUpstream();
	const filer = new FakeUpstream();
	const grpc = fakeGrpc();
	const config = testConfig({ adminUrl: admin.url, masterUrl: master.url, filerUrl: filer.url });
	const services: Services = {
		config,
		admin: new HttpUpstream("admin", `${admin.url}/api`),
		master: new HttpUpstream("master", master.url),
		filer: new HttpUpstream("filer", filer.url),
		grpc,
	};
	const app = createApp({ config, routes: apiRoutes(services) });
	const role = options.role ?? "admin";
	const loginResponse = await app.request("/api/auth/login", {
		method: "POST",
		headers: { "content-type": "application/json", "x-kelp-csrf": "1" },
		body: JSON.stringify({ username: role, password: `${role}-pass` }),
	});
	const cookie = loginResponse.headers.get("set-cookie")?.split(";")[0] ?? "";

	const request = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
		app.request(`/api${path}`, {
			method,
			headers: {
				cookie,
				"x-kelp-csrf": "1",
				...(body !== undefined && !(body instanceof FormData) ? { "content-type": "application/json" } : {}),
				...headers,
			},
			...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
		});

	return {
		app,
		admin,
		master,
		filer,
		grpc,
		request,
		get: (path: string) => request("GET", path),
		// biome-ignore lint/suspicious/noExplicitAny: tests assert on arbitrary JSON shapes.
		async json<T = any>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
			const response = await request(method, path, body);
			return { status: response.status, body: (await response.json()) as T };
		},
		async stop() {
			await Promise.all([admin.stop(), master.stop(), filer.stop()]);
		},
	};
}

export type Harness = Awaited<ReturnType<typeof harness>>;
