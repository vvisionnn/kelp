import { Hono } from "hono";
import pkg from "../../package.json" with { type: "json" };
import type { KelpSettings } from "../../shared/maintenance.ts";
import type { Env } from "../app.ts";
import type { Services } from "../services.ts";

/** A URL safe to show: any embedded user:password is removed. */
export function displayUrl(value: string): string {
	try {
		const url = new URL(value);
		url.username = "";
		url.password = "";
		return url.toString().replace(/\/+$/, "");
	} catch {
		return value.replace(/\/\/[^@/]*@/, "//");
	}
}

export function settingsRoutes({ config }: Services) {
	return new Hono<Env>().get("/system/kelp", (c) => {
		const settings: KelpSettings = {
			version: pkg.version,
			upstreams: [
				{ label: "Admin API", url: displayUrl(config.adminUrl) },
				{ label: "Master", url: displayUrl(config.masterUrl) },
				{ label: "Master gRPC", url: config.masterGrpc },
				{ label: "Filer", url: displayUrl(config.filerUrl) },
				{ label: "Filer gRPC", url: config.filerGrpc },
			],
			s3Endpoint: config.s3Endpoint ? displayUrl(config.s3Endpoint) : null,
			sessionTtlHours: Math.round((config.sessionTtlSeconds / 3600) * 10) / 10,
			viewerEnabled: config.users.some((u) => u.role === "viewer"),
		};
		return c.json(settings);
	});
}
