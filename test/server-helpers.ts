import type { KelpConfig } from "../server/config.ts";

/** A complete config for tests; upstream URLs point nowhere unless overridden. */
export function testConfig(overrides: Partial<KelpConfig> = {}): KelpConfig {
	return {
		port: 0,
		adminUrl: "http://127.0.0.1:1",
		masterUrl: "http://127.0.0.1:1",
		masterGrpc: "127.0.0.1:1",
		filerUrl: "http://127.0.0.1:1",
		filerGrpc: "127.0.0.1:1",
		s3Endpoint: undefined,
		users: [
			{ name: "admin", password: "admin-pass", role: "admin" },
			{ name: "viewer", password: "viewer-pass", role: "viewer" },
		],
		sessionSecret: "test-secret",
		sessionTtlSeconds: 3600,
		staticDir: "dist",
		metricsUrls: [],
		...overrides,
	};
}
