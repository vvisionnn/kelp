import { describe, expect, test } from "bun:test";
import { grpcAddress, loadConfig } from "./config.ts";

describe("loadConfig", () => {
	test("uses defaults that match the bundled stack", () => {
		const { config, warnings } = loadConfig({ KELP_ADMIN_PASSWORD: "pw", KELP_SESSION_SECRET: "s" });
		expect(config).toMatchObject({
			port: 3000,
			adminUrl: "http://127.0.0.1:23646",
			masterUrl: "http://127.0.0.1:9333",
			masterGrpc: "127.0.0.1:19333",
			filerUrl: "http://127.0.0.1:8888",
			filerGrpc: "127.0.0.1:18888",
			s3Endpoint: undefined,
			sessionSecret: "s",
			sessionTtlSeconds: 43200,
			staticDir: "dist",
			users: [{ name: "admin", password: "pw", role: "admin" }],
		});
		expect(warnings).toEqual([]);
	});

	test("reads every setting from the environment", () => {
		const { config } = loadConfig({
			PORT: "8080",
			KELP_ADMIN_URL: "http://admin:23646/",
			KELP_MASTER_URL: "http://master:9333",
			KELP_MASTER_GRPC: "master:19999",
			KELP_FILER_URL: "http://filer:8888",
			KELP_S3_ENDPOINT: "https://s3.example.com/",
			KELP_ADMIN_USER: "root",
			KELP_ADMIN_PASSWORD: "pw",
			KELP_VIEWER_USER: "guest",
			KELP_VIEWER_PASSWORD: "view",
			KELP_SESSION_SECRET: "secret",
			KELP_SESSION_TTL_HOURS: "2",
			KELP_STATIC_DIR: "/srv/kelp",
		});
		expect(config).toMatchObject({
			port: 8080,
			adminUrl: "http://admin:23646",
			masterGrpc: "master:19999",
			filerGrpc: "filer:18888",
			s3Endpoint: "https://s3.example.com",
			sessionTtlSeconds: 7200,
			staticDir: "/srv/kelp",
			users: [
				{ name: "root", password: "pw", role: "admin" },
				{ name: "guest", password: "view", role: "viewer" },
			],
		});
	});

	test("generates a password and secret when unset, with warnings", () => {
		const { config, warnings } = loadConfig({});
		expect(config.users[0]?.password).toMatch(/^[A-Za-z0-9_-]{24}$/);
		expect(config.sessionSecret.length).toBeGreaterThanOrEqual(32);
		expect(warnings.join("\n")).toContain("KELP_ADMIN_PASSWORD");
		expect(warnings.join("\n")).toContain(config.users[0]?.password);
		expect(warnings.join("\n")).toContain("KELP_SESSION_SECRET");
	});

	test.each([
		[{ PORT: "abc" }, "PORT"],
		[{ KELP_SESSION_TTL_HOURS: "0" }, "KELP_SESSION_TTL_HOURS"],
		[{ KELP_ADMIN_URL: "not a url" }, "KELP_ADMIN_URL"],
		[{ KELP_VIEWER_USER: "guest" }, "KELP_VIEWER_PASSWORD"],
		[{ KELP_VIEWER_USER: "admin", KELP_VIEWER_PASSWORD: "x" }, "must differ"],
	])("rejects invalid settings %p", (env, message) => {
		expect(() => loadConfig({ KELP_ADMIN_PASSWORD: "pw", ...env })).toThrow(message);
	});
});

describe("grpcAddress", () => {
	test("adds 10000 to the HTTP port like SeaweedFS does", () => {
		expect(grpcAddress("http://filer:8888")).toBe("filer:18888");
		expect(grpcAddress("https://master")).toBe("master:10443");
		expect(grpcAddress("http://master")).toBe("master:10080");
	});
});
