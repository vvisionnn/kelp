import type {
	BucketTraffic,
	InventoryPoint,
	Telemetry,
	TelemetryPoint,
	TelemetryRange,
	TrafficSample,
} from "../../shared/telemetry.ts";
import { groupSum, increase, merge, parse, quantile, type Sample, type Scrape, total } from "./prom.ts";

export const SCRAPE_SECONDS = 15;
export const ROLLUP_SECONDS = 300;
export const INVENTORY_SECONDS = 60;
const HOUR_POINTS = 3600 / SCRAPE_SECONDS;
const DAY_POINTS = (24 * 3600) / ROLLUP_SECONDS;
const RANGE_SECONDS: Record<TelemetryRange, number> = {
	"15m": 900,
	"1h": 3600,
	"6h": 6 * 3600,
	"24h": 24 * 3600,
};

export interface SamplerOptions {
	/** Prometheus endpoints to scrape; empty disables telemetry. */
	urls: string[];
	/** The cluster's holdings right now, for growth charts. */
	inventory: () => Promise<Omit<InventoryPoint, "t">>;
	fetch?: (url: string, init?: RequestInit) => Promise<Response>;
	now?: () => number;
	timeoutMs?: number;
}

/** One sample's per-bucket S3 counts, kept beside the point so bucket series line up with it. */
interface Stored {
	point: TelemetryPoint;
	buckets: Record<string, { requests: number; errors: number }>;
}

const ms = (seconds: number | null) => (seconds === null ? null : Math.round(seconds * 1e5) / 100);

/** Request rates, error rates and latency percentiles for one component's request metrics. */
function traffic(previous: Scrape, current: Scrape, prefix: string, seconds: number): TrafficSample {
	const requests = increase(previous, current, `${prefix}_request_total`);
	const latency = increase(previous, current, `${prefix}_request_seconds_bucket`);
	const byType: Record<string, number> = {};
	for (const [type, count] of Object.entries(groupSum(requests, "type"))) {
		if (count > 0) byType[type] = count / seconds;
	}
	const errors = (from: number) =>
		requests
			.filter((s) => Number(s.labels.code) >= from && Number(s.labels.code) < from + 100)
			.reduce((a, s) => a + s.value, 0) / seconds;
	return {
		rps: requests.reduce((a, s) => a + s.value, 0) / seconds,
		byType,
		clientErrors: errors(400),
		serverErrors: errors(500),
		p50: ms(quantile(0.5, latency)),
		p95: ms(quantile(0.95, latency)),
		p99: ms(quantile(0.99, latency)),
	};
}

/** Builds one point from two consecutive scrapes `seconds` apart. */
export function pointFrom(previous: Scrape, current: Scrape, seconds: number, t: number): Stored {
	const store: Record<string, number> = {};
	for (const [type, count] of Object.entries(
		groupSum(increase(previous, current, "SeaweedFS_filerStore_request_total"), "type"),
	)) {
		if (count > 0) store[type] = count / seconds;
	}
	const cpu = increase(previous, current, "process_cpu_seconds_total").reduce((a, s) => a + s.value, 0);
	// Linux processes report resident memory; elsewhere fall back to what the Go runtime holds.
	const memory = total(current, "process_resident_memory_bytes") || total(current, "go_memstats_sys_bytes");
	const buckets: Stored["buckets"] = {};
	for (const sample of increase(previous, current, "SeaweedFS_s3_request_total")) {
		const bucket = sample.labels.bucket;
		if (!bucket) continue;
		const entry = buckets[bucket] ?? { requests: 0, errors: 0 };
		buckets[bucket] = entry;
		entry.requests += sample.value;
		if (Number(sample.labels.code) >= 400) entry.errors += sample.value;
	}
	return {
		point: {
			t,
			s3: traffic(previous, current, "SeaweedFS_s3", seconds),
			filer: traffic(previous, current, "SeaweedFS_filer", seconds),
			volume: traffic(previous, current, "SeaweedFS_volumeServer", seconds),
			store,
			inFlight: {
				uploadBytes: total(current, "SeaweedFS_volumeServer_in_flight_upload_size"),
				downloadBytes: total(current, "SeaweedFS_volumeServer_in_flight_download_size"),
			},
			process: {
				cpuPercent: (cpu / seconds) * 100,
				memoryBytes: memory,
				goroutines: total(current, "go_goroutines"),
			},
		},
		buckets,
	};
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const maxOf = (values: Array<number | null>) => {
	const real = values.filter((v): v is number => v !== null);
	return real.length ? Math.max(...real) : null;
};
function meanRecord(records: Array<Record<string, number>>): Record<string, number> {
	const keys = new Set(records.flatMap((r) => Object.keys(r)));
	return Object.fromEntries([...keys].map((k) => [k, mean(records.map((r) => r[k] ?? 0))]));
}
function rollTraffic(samples: TrafficSample[]): TrafficSample {
	return {
		rps: mean(samples.map((s) => s.rps)),
		byType: meanRecord(samples.map((s) => s.byType)),
		clientErrors: mean(samples.map((s) => s.clientErrors)),
		serverErrors: mean(samples.map((s) => s.serverErrors)),
		// A slow minute should still show in a 5-minute view, so latency keeps its worst value.
		p50: maxOf(samples.map((s) => s.p50)),
		p95: maxOf(samples.map((s) => s.p95)),
		p99: maxOf(samples.map((s) => s.p99)),
	};
}

/** Folds several 15-second points into one: averages for rates, the worst value for latency. */
export function rollup(stored: Stored[], t: number): Stored {
	const points = stored.map((s) => s.point);
	const buckets: Stored["buckets"] = {};
	for (const s of stored) {
		for (const [bucket, entry] of Object.entries(s.buckets)) {
			const into = buckets[bucket] ?? { requests: 0, errors: 0 };
			buckets[bucket] = into;
			into.requests += entry.requests;
			into.errors += entry.errors;
		}
	}
	return {
		point: {
			t,
			s3: rollTraffic(points.map((p) => p.s3)),
			filer: rollTraffic(points.map((p) => p.filer)),
			volume: rollTraffic(points.map((p) => p.volume)),
			store: meanRecord(points.map((p) => p.store)),
			inFlight: {
				uploadBytes: mean(points.map((p) => p.inFlight.uploadBytes)),
				downloadBytes: mean(points.map((p) => p.inFlight.downloadBytes)),
			},
			process: {
				cpuPercent: mean(points.map((p) => p.process.cpuPercent)),
				memoryBytes: mean(points.map((p) => p.process.memoryBytes)),
				goroutines: mean(points.map((p) => p.process.goroutines)),
			},
		},
		buckets,
	};
}

/** A fixed-size buffer that drops its oldest entries. */
class Ring<T> {
	private items: T[] = [];
	constructor(private readonly capacity: number) {}
	push(item: T) {
		this.items.push(item);
		if (this.items.length > this.capacity) this.items.splice(0, this.items.length - this.capacity);
	}
	since(t: number, at: (item: T) => number): T[] {
		return this.items.filter((item) => at(item) > t);
	}
}

/**
 * Scrapes SeaweedFS's Prometheus endpoints every 15 seconds and keeps the last hour at full
 * resolution and the last day in 5-minute rollups, in memory. Also records what the cluster holds
 * every minute for growth charts. History starts when Kelp starts.
 */
export class TelemetrySampler {
	private readonly urls: string[];
	private readonly fetch: NonNullable<SamplerOptions["fetch"]>;
	private readonly now: () => number;
	private readonly timeoutMs: number;
	private readonly inventorySource: SamplerOptions["inventory"];
	private previous: { scrape: Scrape; t: number } | null = null;
	private latest: Scrape = new Map();
	private readonly hour = new Ring<Stored>(HOUR_POINTS);
	private readonly day = new Ring<Stored>(DAY_POINTS);
	private readonly inventoryPoints = new Ring<InventoryPoint>(
		DAY_POINTS * (ROLLUP_SECONDS / INVENTORY_SECONDS),
	);
	private pendingRollup: Stored[] = [];
	private unreachable: string[] = [];
	private startedAt: number | null = null;
	private timers: Array<ReturnType<typeof setInterval>> = [];

	constructor(options: SamplerOptions) {
		this.urls = options.urls;
		this.inventorySource = options.inventory;
		this.fetch = options.fetch ?? ((url, init) => fetch(url, init));
		this.now = options.now ?? Date.now;
		this.timeoutMs = options.timeoutMs ?? 5000;
	}

	get enabled() {
		return this.urls.length > 0;
	}

	start() {
		if (!this.enabled || this.timers.length) return;
		this.startedAt = this.now();
		void this.scrape();
		void this.recordInventory();
		this.timers.push(setInterval(() => void this.scrape(), SCRAPE_SECONDS * 1000));
		this.timers.push(setInterval(() => void this.recordInventory(), INVENTORY_SECONDS * 1000));
	}

	stop() {
		for (const timer of this.timers) clearInterval(timer);
		this.timers = [];
	}

	private async fetchOne(url: string): Promise<Scrape | null> {
		try {
			const response = await this.fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) });
			if (!response.ok) return null;
			return parse(await response.text());
		} catch {
			return null;
		}
	}

	/** Scrapes every endpoint once and, from the second scrape on, records a point. */
	async scrape(): Promise<void> {
		const t = this.now();
		const results = await Promise.all(this.urls.map((url) => this.fetchOne(url)));
		this.unreachable = this.urls.filter((_, i) => results[i] === null);
		const current = merge(results.filter((r): r is Scrape => r !== null));
		this.latest = current;
		const previous = this.previous;
		this.previous = { scrape: current, t };
		if (!previous) return;
		const seconds = (t - previous.t) / 1000;
		if (seconds <= 0) return;
		const stored = pointFrom(previous.scrape, current, seconds, t);
		this.hour.push(stored);
		this.pendingRollup.push(stored);
		const first = this.pendingRollup[0] as Stored;
		if (t - first.point.t >= (ROLLUP_SECONDS - SCRAPE_SECONDS) * 1000) {
			this.day.push(rollup(this.pendingRollup, t));
			this.pendingRollup = [];
		}
	}

	async recordInventory(): Promise<void> {
		try {
			this.inventoryPoints.push({ t: this.now(), ...(await this.inventorySource()) });
		} catch {
			// The cluster is unreachable right now; the gap shows in the chart.
		}
	}

	snapshot(range: TelemetryRange): Telemetry {
		const fine = range === "15m" || range === "1h";
		const stepSeconds = fine ? SCRAPE_SECONDS : ROLLUP_SECONDS;
		const from = this.now() - RANGE_SECONDS[range] * 1000;
		const stored = (fine ? this.hour : this.day).since(from, (s) => s.point.t);
		const points = stored.map((s) => s.point);
		const names = new Set(stored.flatMap((s) => Object.keys(s.buckets)));
		const buckets: BucketTraffic[] = [...names]
			.map((bucket) => {
				const counts = stored.map((s) => s.buckets[bucket]);
				return {
					bucket,
					rps: (stored.at(-1)?.buckets[bucket]?.requests ?? 0) / stepSeconds,
					requests: counts.reduce((a, c) => a + (c?.requests ?? 0), 0),
					errors: counts.reduce((a, c) => a + (c?.errors ?? 0), 0),
					series: counts.map((c) => (c?.requests ?? 0) / stepSeconds),
				};
			})
			.sort((a, b) => b.requests - a.requests || a.bucket.localeCompare(b.bucket));
		return {
			enabled: this.enabled,
			range,
			stepSeconds,
			since: this.startedAt,
			points,
			inventory: this.inventoryPoints.since(from, (p) => p.t),
			buckets,
			objectSizes: objectSizes(this.latest.get("SeaweedFS_filer_object_size_bytes_bucket") ?? []),
			disks: disks(this.latest),
			unreachable: this.unreachable,
		};
	}
}

function objectSizes(buckets: Sample[]): Telemetry["objectSizes"] {
	const byLe = new Map<number, number>();
	for (const sample of buckets) {
		const le = sample.labels.le === "+Inf" ? Number.POSITIVE_INFINITY : Number(sample.labels.le);
		if (!Number.isNaN(le)) byLe.set(le, (byLe.get(le) ?? 0) + sample.value);
	}
	// Cumulative counts become counts per bucket; the open-ended top bucket keeps `le` as Infinity,
	// which JSON cannot carry, so it is sent as -1.
	let below = 0;
	return [...byLe.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([le, cumulative]) => {
			const count = cumulative - below;
			below = cumulative;
			return { le: Number.isFinite(le) ? le : -1, count };
		});
}

function disks(scrape: Scrape): Telemetry["disks"] {
	const byPath = new Map<string, { usedBytes: number; totalBytes: number }>();
	for (const sample of scrape.get("SeaweedFS_volumeServer_resource") ?? []) {
		const path = sample.labels.name ?? "";
		const entry = byPath.get(path) ?? { usedBytes: 0, totalBytes: 0 };
		if (sample.labels.type === "all") entry.totalBytes += sample.value;
		if (sample.labels.type === "used") entry.usedBytes += sample.value;
		byPath.set(path, entry);
	}
	return [...byPath.entries()].map(([path, entry]) => ({ path, ...entry }));
}
