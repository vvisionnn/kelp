import type { KelpConfig } from "./config.ts";
import { type ClusterGrpc, SeaweedGrpc } from "./upstream/grpc.ts";
import { HttpUpstream } from "./upstream/http.ts";

/** Clients for every SeaweedFS component Kelp talks to. */
export interface Services {
	config: KelpConfig;
	/** Native `weed admin` JSON API. */
	admin: HttpUpstream;
	master: HttpUpstream;
	filer: HttpUpstream;
	grpc: ClusterGrpc;
}

export function createServices(config: KelpConfig): Services {
	return {
		config,
		admin: new HttpUpstream("admin", `${config.adminUrl}/api`),
		master: new HttpUpstream("master", config.masterUrl),
		// Uploads and recursive deletes can take a while.
		filer: new HttpUpstream("filer", config.filerUrl, { timeoutMs: 10 * 60_000 }),
		grpc: new SeaweedGrpc(config.masterGrpc),
	};
}
