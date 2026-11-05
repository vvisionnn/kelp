import type { Telemetry, TelemetryPoint, TrafficSample } from "@shared/telemetry.ts";

function traffic(i: number, scale: number, types: Record<string, number>): TrafficSample {
	const byType = Object.fromEntries(
		Object.entries(types).map(([type, weight]) => [type, weight * scale * (1 + (i % 5) / 10)]),
	);
	const rps = Object.values(byType).reduce((a, b) => a + b, 0);
	return {
		rps,
		byType,
		clientErrors: i % 7 === 0 ? 0.2 : 0,
		serverErrors: 0,
		p50: rps > 0 ? 4 + (i % 3) : null,
		p95: rps > 0 ? 18 + (i % 4) * 2 : null,
		p99: rps > 0 ? 40 + i : null,
	};
}

/** Deterministic telemetry: `count` points 15s apart ending at `end`, with realistic shapes. */
export function makeTelemetry(count = 12, end = Date.parse("2026-11-05T12:00:00Z")): Telemetry {
	const points: TelemetryPoint[] = Array.from({ length: count }, (_, i) => ({
		t: end - (count - 1 - i) * 15_000,
		s3: traffic(i, 2, { GET: 3, PUT: 1, LIST: 0.5, HEAD: 0.4, DELETE: 0.1, POST: 0.05 }),
		filer: traffic(i, 1, { GET: 2, PUT: 1 }),
		volume: traffic(i, 1, { GET: 4, POST: 1.5 }),
		store: { find: 6 + i, insert: 1, prefixList: 2, delete: 0.2, update: 0.1 },
		inFlight: { uploadBytes: 0, downloadBytes: 1024 * i },
		process: { cpuPercent: 3 + (i % 3), memoryBytes: 400 * 1024 ** 2, goroutines: 300 },
	}));
	return {
		enabled: true,
		range: "1h",
		stepSeconds: 15,
		since: points[0]?.t ?? null,
		points,
		inventory: points.map((p, i) => ({
			t: p.t,
			storedBytes: 40e6 + i * 1e6,
			files: 340 + i,
			volumes: 57,
			diskUsedBytes: 170e9,
			diskTotalBytes: 228e9,
		})),
		buckets: [
			{
				bucket: "photo-library",
				rps: 3,
				requests: 2400,
				errors: 2,
				series: points.map((_, i) => 2 + (i % 3)),
			},
			{ bucket: "backups", rps: 1, requests: 900, errors: 0, series: points.map(() => 1) },
		],
		objectSizes: [
			{ le: 1024, count: 20 },
			{ le: 1024 ** 2, count: 280 },
			{ le: 64 * 1024 ** 2, count: 55 },
			{ le: -1, count: 2 },
		],
		disks: [{ path: "/data", usedBytes: 170e9, totalBytes: 228e9 }],
		unreachable: [],
	};
}
