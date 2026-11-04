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

// ---------------------------------------------------------------- storage

export interface Volume {
	id: number;
	server: string;
	dataCenter: string;
	rack: string;
	diskType: string;
	collection: string;
	size: number;
	fileCount: number;
	deleteCount: number;
	deletedBytes: number;
	garbageRatio: number;
	fullnessRatio: number;
	replication: string;
	ttl: string;
	readOnly: boolean;
	version: number;
	compactRevision: number;
	modifiedAt: string | null;
}

export interface EcShard {
	volumeId: number;
	server: string;
	dataCenter: string;
	rack: string;
	diskType: string;
	collection: string;
	shardIds: number[];
	size: number;
}

export interface StorageInventory {
	volumeSizeLimitMb: number;
	volumes: Volume[];
	ecShards: EcShard[];
	totals: {
		volumes: number;
		ecShards: number;
		size: number;
		files: number;
		deletedFiles: number;
		deletedBytes: number;
	};
	duplicateVolumeIds: number[];
}

export interface Collection {
	name: string;
	volumes: number;
	ecVolumes: number;
	size: number;
	files: number;
	deletedBytes: number;
	diskTypes: string[];
}

export interface GrowVolumesRequest {
	count: number;
	collection?: string;
	replication?: string;
	ttl?: string;
	dataCenter?: string;
	diskType?: string;
}

// ---------------------------------------------------------------- buckets

export interface Bucket {
	name: string;
	createdAt: string | null;
	updatedAt: string | null;
	logicalSize: number;
	physicalSize: number;
	objectCount: number | null;
	quota: number;
	quotaEnabled: boolean;
	readOnly: boolean;
	owner: string;
	versioning: "Enabled" | "Suspended" | "Off";
	objectLock: { enabled: boolean; mode: string; days: number };
	lifecycleRules: number;
	policyStatements: number;
}

export interface CreateBucketRequest {
	name: string;
	owner?: string;
	quota?: { size: number; unit: "MB" | "GB" | "TB" };
	versioning?: boolean;
	objectLock?: { mode: "GOVERNANCE" | "COMPLIANCE"; days: number };
}

export interface LifecycleRule {
	id: string;
	status: "Enabled" | "Disabled";
	prefix: string;
	expirationDays: number | null;
	noncurrentExpirationDays: number | null;
	abortIncompleteUploadDays: number | null;
	deleteExpiredMarkers: boolean;
}

// ---------------------------------------------------------------- files

export interface FileEntry {
	name: string;
	path: string;
	isDirectory: boolean;
	size: number;
	mime: string;
	modifiedAt: string | null;
	createdAt: string | null;
	mode: number;
	ttlSeconds: number;
	md5: string | null;
	chunks: number;
	symlinkTarget: string | null;
}

export interface FileListing {
	path: string;
	entries: FileEntry[];
	/** Pass back as `cursor` to load the next page; null on the last page. */
	nextCursor: string | null;
}

export interface FileDetails extends FileEntry {
	extended: Record<string, string>;
	chunkList: Array<{ fileId: string; offset: number; size: number; modifiedAt: string | null }>;
	tags: Record<string, string>;
}

// ---------------------------------------------------------------- identity

export interface AccessKey {
	accessKey: string;
	status: "Active" | "Inactive";
	createdAt: string | null;
}

export interface IamUser {
	name: string;
	email: string;
	actions: string[];
	policies: string[];
	groups: string[];
	accessKeys: AccessKey[];
	isStatic: boolean;
}

/** Returned once when a secret is created; it cannot be retrieved later. */
export interface NewAccessKey {
	accessKey: string;
	secretKey: string;
}

export interface IamGroup {
	name: string;
	enabled: boolean;
	members: string[];
	policies: string[];
}

export interface ServiceAccount {
	id: string;
	parentUser: string;
	description: string;
	accessKey: string;
	status: "Active" | "Inactive";
	actions: string[];
	expiresAt: string | null;
	createdAt: string | null;
}

export interface IamPolicy {
	name: string;
	document: PolicyDocument;
}

export interface PolicyDocument {
	Version: string;
	Statement: Array<Record<string, unknown>>;
}

// ---------------------------------------------------------------- maintenance

export interface JobType {
	jobType: string;
	displayName: string;
	description: string;
	weight: number;
}

export interface Worker {
	id: string;
	instance: string;
	address: string;
	version: string;
	connectedAt: string | null;
	lastSeenAt: string | null;
	capabilities: string[];
}
