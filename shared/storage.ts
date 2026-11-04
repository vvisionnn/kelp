// Contract types for the storage area: volumes, collections and erasure coding.

/** One copy of a volume on one volume server disk. */
export interface VolumeReplica {
	server: string;
	dataCenter: string;
	rack: string;
	diskType: string;
	diskId: number;
	size: number;
	fileCount: number;
	deleteCount: number;
	deletedBytes: number;
	readOnly: boolean;
	compactRevision: number;
	modifiedAt: string | null;
	remoteStorage: string;
}

/** A volume across all its replicas. Totals come from the largest replica. */
export interface StorageVolume {
	id: number;
	collection: string;
	replication: string;
	ttl: string;
	version: number;
	diskType: string;
	size: number;
	fileCount: number;
	deleteCount: number;
	deletedBytes: number;
	/** Deleted bytes as a share of size, 0–1. */
	garbageRatio: number;
	/** Size as a share of the cluster volume size limit, 0–1. */
	fullness: number;
	/** True when any replica refuses writes. */
	readOnly: boolean;
	modifiedAt: string | null;
	replicas: VolumeReplica[];
	/** Expected copies from the replication setting, e.g. "010" → 2. */
	expectedReplicas: number;
}

/** The shards of one EC volume held by one disk. */
export interface EcPlacement {
	server: string;
	dataCenter: string;
	rack: string;
	diskType: string;
	diskId: number;
	shards: Array<{ id: number; size: number }>;
	size: number;
}

export interface EcVolume {
	id: number;
	collection: string;
	/** Data + parity shards in the encoding (10 + 4 by default). */
	totalShards: number;
	dataShards: number;
	parityShards: number;
	presentShards: number[];
	missingShards: number[];
	/** Shards held by more than one disk. */
	duplicateShards: number[];
	size: number;
	fileCount: number;
	deleteCount: number;
	expiresAt: string | null;
	placements: EcPlacement[];
}

export interface StorageDisk {
	server: string;
	dataCenter: string;
	rack: string;
	diskType: string;
	diskId: number;
	volumeCount: number;
	maxVolumeCount: number;
	freeVolumeCount: number;
	remoteVolumeCount: number;
	ecShardCount: number;
}

export interface StorageCollection {
	/** Empty string is the default collection. */
	name: string;
	volumeCount: number;
	ecVolumeCount: number;
	size: number;
	fileCount: number;
	deleteCount: number;
	deletedBytes: number;
	servers: string[];
	diskTypes: string[];
	replications: string[];
}

export interface StorageInventory {
	generatedAt: string | null;
	volumeSizeLimitBytes: number;
	totals: {
		volumes: number;
		ecVolumes: number;
		ecShards: number;
		size: number;
		files: number;
		deletedFiles: number;
		deletedBytes: number;
	};
	volumes: StorageVolume[];
	ecVolumes: EcVolume[];
	collections: StorageCollection[];
	disks: StorageDisk[];
	/** Volume ids reported under more than one collection — a sign of trouble. */
	duplicateVolumeIds: Array<{ volumeId: number; collections: string[] }>;
}

export interface GrowVolumesInput {
	count: number;
	collection?: string;
	replication?: string;
	ttl?: string;
	dataCenter?: string;
	rack?: string;
	dataNode?: string;
	diskType?: string;
}

export interface VacuumClusterInput {
	/** Compact volumes whose garbage share is at least this, 0–1. */
	garbageThreshold: number;
}
