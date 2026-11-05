/**
 * A gentle, realistic S3 workload for the review environment, so Kelp's live charts have
 * something to show: mostly reads, some listings and small writes, the odd miss, at a rate that
 * drifts over a ten-minute cycle. Writes only touch keys under `kelp-traffic/` and overwrite a
 * fixed set of them, so the cluster does not grow.
 *
 *   bun scripts/traffic.ts [--offset 0] [--rps 6]
 */
import { parseArgs } from "node:util";
import { S3Client } from "bun";
import { S3_CREDENTIALS, stackPorts } from "./stack-lib.ts";

const { values } = parseArgs({
	options: {
		offset: { type: "string", default: "0" },
		rps: { type: "string", default: "6" },
	},
});

const s3 = new S3Client({
	accessKeyId: S3_CREDENTIALS.accessKey,
	secretAccessKey: S3_CREDENTIALS.secretKey,
	endpoint: `http://127.0.0.1:${stackPorts(Number(values.offset)).s3}`,
});

/** Buckets by share of traffic, busiest first. */
const BUCKETS: Array<[string, number]> = [
	["media-assets", 0.35],
	["photo-library", 0.25],
	["web-logs", 0.15],
	["analytics", 0.15],
	["ci-artifacts", 0.1],
];
const OPERATIONS: Array<[string, number]> = [
	["get", 0.58],
	["head", 0.1],
	["list", 0.14],
	["put", 0.13],
	["miss", 0.03],
	["delete", 0.02],
];

/** The length of one slow swell in the request rate. */
const CYCLE_MS = 10 * 60 * 1000;
const TICK_MS = 250;

function pick<T>(weights: Array<[T, number]>): T {
	let roll = Math.random();
	for (const [value, weight] of weights) {
		roll -= weight;
		if (roll <= 0) return value;
	}
	return (weights.at(-1) as [T, number])[0];
}

const keys = new Map<string, string[]>();
for (const [bucket] of BUCKETS) {
	const listed = await s3.list({ maxKeys: 200 }, { bucket }).catch(() => ({ contents: [] }));
	keys.set(
		bucket,
		(listed.contents ?? []).map((object) => object.key).filter((key) => !key.startsWith("kelp-traffic/")),
	);
}

async function once() {
	const bucket = pick(BUCKETS);
	const existing = keys.get(bucket) ?? [];
	const known = existing[Math.floor(Math.random() * existing.length)];
	const scratch = `kelp-traffic/item-${Math.floor(Math.random() * 40)}.json`;
	switch (pick(OPERATIONS)) {
		case "get":
			if (known) await s3.file(known, { bucket }).arrayBuffer();
			break;
		case "head":
			if (known) await s3.file(known, { bucket }).stat();
			break;
		case "list":
			await s3.list({ maxKeys: 50 }, { bucket });
			break;
		case "put":
			await s3.file(scratch, { bucket, type: "application/json" }).write(JSON.stringify({ at: Date.now() }));
			break;
		case "miss":
			await s3.file(`missing/${Date.now()}`, { bucket }).arrayBuffer();
			break;
		case "delete":
			await s3.file(scratch, { bucket }).delete();
			break;
	}
}

const base = Number(values.rps);
console.log(`[traffic] about ${base} S3 requests per second across ${BUCKETS.length} buckets`);
for (;;) {
	// The rate drifts between half and one and a half times the base over each cycle.
	const rate = base * (1 + 0.5 * Math.sin((Date.now() / CYCLE_MS) * 2 * Math.PI));
	const burst = Math.max(1, Math.round((rate * TICK_MS) / 1000));
	await Promise.all(Array.from({ length: burst }, () => once().catch(() => undefined)));
	await Bun.sleep(TICK_MS);
}
