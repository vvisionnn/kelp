/** API contract shared by the Kelp server and the web client. All sizes are bytes, times ISO strings. */

export type Role = "admin" | "viewer";

export interface SessionUser {
	name: string;
	role: Role;
}

export interface ApiErrorBody {
	error: string;
	/** Which SeaweedFS component failed, when the error came from upstream. */
	upstream?: string;
}

// ---------------------------------------------------------------- cluster

export interface MasterNode {
	address: string;
	isLeader: boolean;
	suffrage?: string;
}

export interface VolumeServer {
	id: string;
	address: string;
	publicUrl: string;
	dataCenter: string;
	rack: string;
	version: string;
	volumes: number;
	maxVolumes: number;
	diskUsage: number;
	diskCapacity: number;
	ecShards: number;
	ecVolumes: number;
	remoteSize: number;
	lastHeartbeat: string | null;
}

export interface ClusterNode {
	address: string;
	version: string;
	dataCenter: string;
	rack: string;
	createdAt: string | null;
}

export interface MountClient {
	filer: string;
	clientName: string;
	clientId: string;
	clientType: string;
	path: string;
	version: string;
	address: string;
	connectedAt: string | null;
}

export interface Topic {
	namespace: string;
	name: string;
}

export interface TopologyRack {
	id: string;
	nodes: VolumeServer[];
}

export interface TopologyDataCenter {
	id: string;
	racks: TopologyRack[];
}

export interface TierStat {
	name: string;
	isRemote: boolean;
	volumeCount: number;
	ecShardCount: number;
	dataSize: number;
	diskUsed: number;
	diskCapacity: number;
	maxVolumes: number;
}

export interface VersionGroup {
	type: string;
	total: number;
	versions: Array<{ version: string; count: number }>;
}

export interface Overview {
	totalVolumes: number;
	totalFiles: number;
	totalSize: number;
	volumeSizeLimitMb: number;
	totalEcVolumes: number;
	totalEcShards: number;
	totalMountClients: number;
	masters: MasterNode[];
	volumeServers: VolumeServer[];
	filers: ClusterNode[];
	s3Gateways: ClusterNode[];
	brokers: ClusterNode[];
	dataCenters: TopologyDataCenter[];
	tiers: TierStat[];
	versions: { uniform: boolean; version: string; groups: VersionGroup[] };
	maintenance: { workers: number; tasks: number };
	updatedAt: string;
}
