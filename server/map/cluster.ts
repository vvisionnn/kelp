import type {
	ClusterNode,
	MasterNode,
	Overview,
	TierStat,
	TopologyDataCenter,
	VersionGroup,
	VolumeServer,
} from "../../shared/api.ts";
import { bool, list, num, obj, type Raw, str, time } from "./raw.ts";

export interface ClusterNodes {
	filer: ClusterNode[];
	s3: ClusterNode[];
	broker: ClusterNode[];
}

export function mapVolumeServer(raw: Raw): VolumeServer {
	const address = str(raw.address);
	return {
		id: str(raw.id) || address,
		address,
		publicUrl: str(raw.public_url) || address,
		dataCenter: str(raw.datacenter),
		rack: str(raw.rack),
		version: str(raw.version),
		volumes: num(raw.volumes),
		maxVolumes: num(raw.max_volumes),
		diskUsage: num(raw.disk_usage),
		diskCapacity: num(raw.disk_capacity),
		ecShards: num(raw.ec_shards),
		ecVolumes: num(raw.ec_volumes),
		remoteSize: num(raw.remote_size),
		lastHeartbeat: time(raw.last_heartbeat),
	};
}

export function mapDataCenters(raw: unknown): TopologyDataCenter[] {
	return list(raw).map((dc) => ({
		id: str(dc.id),
		racks: list(dc.racks).map((rack) => ({ id: str(rack.id), nodes: list(rack.nodes).map(mapVolumeServer) })),
	}));
}

function mapTier(raw: Raw): TierStat {
	return {
		name: str(raw.name),
		isRemote: bool(raw.is_remote),
		volumeCount: num(raw.volume_count),
		ecShardCount: num(raw.ec_shard_count),
		dataSize: num(raw.data_size),
		diskUsed: num(raw.disk_used),
		diskCapacity: num(raw.disk_capacity),
		maxVolumes: num(raw.max_volumes),
	};
}

function mapVersionGroup(raw: Raw): VersionGroup {
	return {
		type: str(raw.type),
		total: num(raw.total),
		versions: list(raw.versions).map((v) => ({ version: str(v.version), count: num(v.count) })),
	};
}

export function mapMasters(raw: Raw): MasterNode[] {
	return list(raw.masters).map((m) => ({
		address: str(m.address),
		isLeader: bool(m.is_leader),
		...(m.suffrage ? { suffrage: str(m.suffrage) } : {}),
	}));
}

export function mapOverview(raw: Raw, nodes: ClusterNodes): Overview {
	const versions = obj(raw.version_summary);
	const trends = obj(raw.trends);
	return {
		totalVolumes: num(raw.total_volumes),
		totalFiles: num(raw.total_chunks),
		totalSize: num(raw.total_size),
		volumeSizeLimitMb: num(raw.volume_size_limit_mb),
		totalEcVolumes: num(raw.total_ec_volumes),
		totalEcShards: num(raw.total_ec_shards),
		totalMountClients: num(raw.total_mount_clients),
		masters: list(raw.master_nodes).map((m) => ({ address: str(m.address), isLeader: bool(m.is_leader) })),
		volumeServers: list(raw.volume_servers).map(mapVolumeServer),
		filers: nodes.filer,
		s3Gateways: nodes.s3,
		brokers: nodes.broker,
		dataCenters: mapDataCenters(raw.datacenters),
		tiers: list(raw.tier_stats).map(mapTier),
		versions: {
			uniform: versions.uniform === undefined ? true : bool(versions.uniform),
			version: str(versions.version),
			groups: list(versions.node_types).map(mapVersionGroup),
		},
		maintenance: { workers: num(trends.workers), tasks: num(trends.tasks) },
		updatedAt: time(raw.last_updated) ?? new Date(0).toISOString(),
	};
}
