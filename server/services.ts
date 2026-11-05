import type { KelpConfig } from "./config.ts";
import { inventoryFrom } from "./map/cluster.ts";
import type { Raw } from "./map/raw.ts";
import { TelemetrySampler } from "./telemetry/sampler.ts";
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
	/** Live rates and growth sampled from SeaweedFS (see server/telemetry). */
	telemetry: TelemetrySampler;
}

export function createServices(config: KelpConfig): Services {
	const admin = new HttpUpstream("admin", `${config.adminUrl}/api`);
	return {
		config,
		admin,
		master: new HttpUpstream("master", config.masterUrl),
		// Uploads and recursive deletes can take a while.
		filer: new HttpUpstream("filer", config.filerUrl, { timeoutMs: 10 * 60_000 }),
		grpc: new SeaweedGrpc(config.masterGrpc),
		telemetry: new TelemetrySampler({
			urls: config.metricsUrls,
			inventory: async () => inventoryFrom(await admin.json<Raw>("admin")),
		}),
	};
}
