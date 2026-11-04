import { Hono } from "hono";
import pkg from "../../package.json" with { type: "json" };
import type { ClusterNode } from "../../shared/api.ts";
import type { Env } from "../app.ts";
import {
	type ClusterNodes,
	mapDataCenters,
	mapMasters,
	mapOverview,
	mapVolumeServer,
} from "../map/cluster.ts";
import { bool, list, num, obj, type Raw, str, time } from "../map/raw.ts";
import type { Services } from "../services.ts";
import { cleanVersion, grpcFromClusterAddress } from "../upstream/grpc.ts";

const NODE_TYPES = { filers: "filer", s3: "s3", brokers: "broker" } as const;

function adminNodes(raw: unknown): ClusterNode[] {
	return list(raw).map((n) => ({
		address: grpcFromClusterAddress(str(n.address)).display,
		version: cleanVersion(str(n.version)),
		dataCenter: str(n.datacenter),
		rack: str(n.rack),
		createdAt: time(n.last_updated),
	}));
}

export function clusterRoutes({ admin, master, grpc, config }: Services) {
	/** Live membership from the master, or the admin's cached view if gRPC is unreachable. */
	async function clusterNodes(dashboard: Raw): Promise<ClusterNodes> {
		try {
			const [filer, s3, broker] = await Promise.all([
				grpc.listClusterNodes("filer"),
				grpc.listClusterNodes("s3"),
				grpc.listClusterNodes("broker"),
			]);
			return { filer, s3, broker };
		} catch {
			return {
				filer: adminNodes(dashboard.filer_nodes),
				s3: adminNodes(dashboard.s3_nodes),
				broker: adminNodes(dashboard.message_brokers),
			};
		}
	}

	return new Hono<Env>()
		.get("/overview", async (c) => {
			const dashboard = await admin.json<Raw>("admin");
			return c.json(mapOverview(dashboard, await clusterNodes(dashboard)));
		})
		.get("/cluster/masters", async (c) => {
			const [masters, status] = await Promise.all([
				admin.json<Raw>("cluster/masters"),
				master.json<Raw>("cluster/status"),
			]);
			return c.json({
				masters: mapMasters(masters),
				leader: grpcFromClusterAddress(str(status.Leader)).display,
				maxVolumeId: num(status.MaxVolumeId),
			});
		})
		.get("/cluster/volume-servers", async (c) => {
			const raw = await admin.json<Raw>("cluster/volumes");
			return c.json({ volumeServers: list(raw.volume_servers).map(mapVolumeServer) });
		})
		.get("/cluster/topology", async (c) => {
			const raw = await admin.json<Raw>("cluster/topology");
			return c.json({ dataCenters: mapDataCenters(raw.datacenters) });
		})
		.get("/cluster/mount-clients", async (c) => {
			const filers = await grpc.listClusterNodes("filer");
			const clients = await grpc.listMountClients(filers.map((f) => grpcFromClusterAddress(f.address)));
			return c.json({ clients });
		})
		.get("/cluster/:type{filers|s3|brokers}", async (c) => {
			const type = NODE_TYPES[c.req.param("type") as keyof typeof NODE_TYPES];
			return c.json({ nodes: await grpc.listClusterNodes(type) });
		})
		.get("/system/config", async (c) => {
			const info = obj((await admin.json<Raw>("config")).config_info);
			return c.json({
				masterAddress: str(info.master_address),
				dataDir: str(info.data_dir),
				maintenanceEnabled: bool(info.maintenance_enabled),
				maintenanceRunning: bool(info.maintenance_running),
				cacheExpiration: str(info.cache_expiration),
				filerCacheExpiration: str(info.filer_cache_expiration),
				s3PublicEndpoint: str(info.s3_public_endpoint),
				kelp: { version: pkg.version, s3Endpoint: config.s3Endpoint ?? null },
			});
		});
}
