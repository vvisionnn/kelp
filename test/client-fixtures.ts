import type { Overview } from "@shared/api.ts";
import { mapDataCenters, mapMasters, mapOverview, mapVolumeServer } from "../server/map/cluster.ts";
import { fixture } from "./render-app.tsx";

const nodes = {
	filer: [{ address: "127.0.0.1:18888", version: "4.52 abc", dataCenter: "", rack: "", createdAt: null }],
	s3: [{ address: "127.0.0.1:18333", version: "4.52 abc", dataCenter: "", rack: "", createdAt: null }],
	broker: [],
};

/** API responses built from real SeaweedFS fixtures through the server's mappers. */
export async function clusterApi() {
	const admin = await fixture<Record<string, unknown>>("admin/admin");
	const overview: Overview = mapOverview(admin, nodes);
	const volumeServers = (
		await fixture<{ volume_servers: Array<Record<string, unknown>> }>("admin/volume-servers")
	).volume_servers.map(mapVolumeServer);
	const topology = mapDataCenters((await fixture<{ datacenters: unknown }>("admin/topology")).datacenters);
	const masters = mapMasters(await fixture("admin/masters"));
	return {
		overview,
		routes: {
			"GET /overview": overview,
			"GET /cluster/masters": { masters, leader: "127.0.0.1:19333", maxVolumeId: 21 },
			"GET /cluster/volume-servers": { volumeServers },
			"GET /cluster/topology": { dataCenters: topology },
			"GET /cluster/filers": { nodes: nodes.filer },
			"GET /cluster/s3": { nodes: nodes.s3 },
			"GET /cluster/brokers": { nodes: [] },
			"GET /cluster/mount-clients": { clients: [] },
		},
	};
}
