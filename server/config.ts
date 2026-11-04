import { randomBytes } from "node:crypto";
import type { KelpUser } from "./auth.ts";

export interface KelpConfig {
	port: number;
	/** Native `weed admin` server, run internally without its own auth. */
	adminUrl: string;
	masterUrl: string;
	masterGrpc: string;
	filerUrl: string;
	filerGrpc: string;
	/** Public S3 endpoint shown to users (for copy-paste snippets), if any. */
	s3Endpoint: string | undefined;
	users: KelpUser[];
	sessionSecret: string;
	sessionTtlSeconds: number;
	staticDir: string;
}

type Env = Record<string, string | undefined>;

/** SeaweedFS serves gRPC on the HTTP port + 10000 unless configured otherwise. */
export function grpcAddress(httpUrl: string): string {
	const url = new URL(httpUrl);
	const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
	return `${url.hostname}:${port + 10000}`;
}

function urlSetting(env: Env, name: string, fallback: string): string {
	const raw = env[name]?.trim() || fallback;
	try {
		return new URL(raw).toString().replace(/\/+$/, "");
	} catch {
		throw new Error(`${name} must be an http(s) URL, got "${raw}"`);
	}
}

function positiveNumber(env: Env, name: string, fallback: number): number {
	const raw = env[name]?.trim();
	if (!raw) return fallback;
	const value = Number(raw);
	if (!Number.isFinite(value) || value <= 0)
		throw new Error(`${name} must be a positive number, got "${raw}"`);
	return value;
}

const randomToken = (bytes: number) => randomBytes(bytes).toString("base64url");

export function loadConfig(env: Env): { config: KelpConfig; warnings: string[] } {
	const warnings: string[] = [];
	const masterUrl = urlSetting(env, "KELP_MASTER_URL", "http://127.0.0.1:9333");
	const filerUrl = urlSetting(env, "KELP_FILER_URL", "http://127.0.0.1:8888");

	const adminName = env.KELP_ADMIN_USER?.trim() || "admin";
	let adminPassword = env.KELP_ADMIN_PASSWORD ?? "";
	if (!adminPassword) {
		adminPassword = randomToken(18);
		warnings.push(
			`KELP_ADMIN_PASSWORD is not set. Generated a password for "${adminName}" for this run: ${adminPassword}`,
		);
	}
	const users: KelpUser[] = [{ name: adminName, password: adminPassword, role: "admin" }];
	const viewerName = env.KELP_VIEWER_USER?.trim();
	if (viewerName) {
		if (!env.KELP_VIEWER_PASSWORD)
			throw new Error("KELP_VIEWER_PASSWORD is required when KELP_VIEWER_USER is set");
		if (viewerName === adminName) throw new Error("KELP_VIEWER_USER must differ from KELP_ADMIN_USER");
		users.push({ name: viewerName, password: env.KELP_VIEWER_PASSWORD, role: "viewer" });
	}

	let sessionSecret = env.KELP_SESSION_SECRET ?? "";
	if (!sessionSecret) {
		sessionSecret = randomToken(32);
		warnings.push("KELP_SESSION_SECRET is not set. Sessions will not survive a restart.");
	}

	const s3 = env.KELP_S3_ENDPOINT?.trim();
	return {
		config: {
			port: positiveNumber(env, "PORT", 3000),
			adminUrl: urlSetting(env, "KELP_ADMIN_URL", "http://127.0.0.1:12535"),
			masterUrl,
			masterGrpc: env.KELP_MASTER_GRPC?.trim() || grpcAddress(masterUrl),
			filerUrl,
			filerGrpc: env.KELP_FILER_GRPC?.trim() || grpcAddress(filerUrl),
			s3Endpoint: s3 ? urlSetting(env, "KELP_S3_ENDPOINT", s3) : undefined,
			users,
			sessionSecret,
			sessionTtlSeconds: Math.round(positiveNumber(env, "KELP_SESSION_TTL_HOURS", 12) * 3600),
			staticDir: env.KELP_STATIC_DIR?.trim() || "dist",
		},
		warnings,
	};
}
