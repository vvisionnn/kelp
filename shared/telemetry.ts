/**
 * Live telemetry: rates and gauges Kelp samples from SeaweedFS's Prometheus endpoints, plus a
 * periodic inventory sample, kept in memory as time series. Served by `GET /api/telemetry`.
 */

/** How far back a chart looks. */
export type TelemetryRange = "15m" | "1h" | "6h" | "24h";

/** Request traffic for one SeaweedFS component over one sampling interval. */
export interface TrafficSample {
	/** Requests per second, all types. */
	rps: number;
	/** Requests per second by request type (GET, PUT, POST, DELETE, HEAD, LIST, ...). */
	byType: Record<string, number>;
	/** Responses with a 4xx status, per second. */
	clientErrors: number;
	/** Responses with a 5xx status, per second. */
	serverErrors: number;
	/** Latency percentiles in milliseconds, from the histogram's change over the interval. Null when idle. */
	p50: number | null;
	p95: number | null;
	p99: number | null;
}

export interface TelemetryPoint {
	/** Sample time, ms since epoch. */
	t: number;
	s3: TrafficSample;
	filer: TrafficSample;
	volume: TrafficSample;
	/** Filer metadata store operations per second by type (find, insert, delete, prefixList, ...). */
	store: Record<string, number>;
	/** Bytes being uploaded and downloaded right now across volume servers. */
	inFlight: { uploadBytes: number; downloadBytes: number };
	/** Process health summed over every scraped SeaweedFS process. */
	process: { cpuPercent: number; memoryBytes: number; goroutines: number };
}

/** A slower sample of what the cluster holds, for growth charts. */
export interface InventoryPoint {
	t: number;
	storedBytes: number;
	files: number;
	volumes: number;
	diskUsedBytes: number;
	diskTotalBytes: number;
}

export interface BucketTraffic {
	bucket: string;
	/** Requests per second over the latest interval. */
	rps: number;
	/** Requests in the selected range. */
	requests: number;
	errors: number;
	/** Requests per second at each point of the range, aligned with `points`. */
	series: number[];
}

export interface Telemetry {
	/** False when no metrics endpoints are configured (KELP_METRICS_URLS). */
	enabled: boolean;
	range: TelemetryRange;
	/** Seconds between points in `points`. */
	stepSeconds: number;
	/** When sampling started; charts show nothing before it. */
	since: number | null;
	points: TelemetryPoint[];
	inventory: InventoryPoint[];
	/** S3 traffic per bucket over the range, busiest first. */
	buckets: BucketTraffic[];
	/** Distribution of object sizes written since the filer started (cumulative histogram). */
	objectSizes: Array<{ le: number; count: number }>;
	/** Disk usage per volume server disk, from the volume servers' own report. */
	disks: Array<{ path: string; usedBytes: number; totalBytes: number }>;
	/** Endpoints that failed on the latest scrape, so the UI can say what is missing. */
	unreachable: string[];
}
