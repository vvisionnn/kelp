/**
 * Prometheus text exposition, reduced to what Kelp charts: samples, label sums, counter deltas and
 * histogram percentiles. Mirrors PromQL's `rate` (with counter resets) and `histogram_quantile`.
 */

export interface Sample {
	name: string;
	labels: Record<string, string>;
	value: number;
}

/** A scrape indexed by metric name. */
export type Scrape = Map<string, Sample[]>;

const LINE = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(.*)\})?\s+(\S+)/;
const LABEL = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g;

function parseValue(raw: string): number {
	if (raw === "+Inf") return Number.POSITIVE_INFINITY;
	if (raw === "-Inf") return Number.NEGATIVE_INFINITY;
	return Number(raw);
}

export function parse(text: string): Scrape {
	const scrape: Scrape = new Map();
	for (const line of text.split("\n")) {
		if (!line || line.startsWith("#")) continue;
		const match = LINE.exec(line);
		if (!match) continue;
		const [, name, labelText, raw] = match as unknown as [string, string, string | undefined, string];
		const value = parseValue(raw);
		if (Number.isNaN(value)) continue;
		const labels: Record<string, string> = {};
		for (const [, key, val] of (labelText ?? "").matchAll(LABEL)) {
			labels[key as string] = (val as string).replace(/\\(.)/g, (_, c: string) => (c === "n" ? "\n" : c));
		}
		const list = scrape.get(name);
		const sample = { name, labels, value };
		if (list) list.push(sample);
		else scrape.set(name, [sample]);
	}
	return scrape;
}

/** Combines several scrapes (one per process) into one. */
export function merge(scrapes: Scrape[]): Scrape {
	const merged: Scrape = new Map();
	for (const scrape of scrapes) {
		for (const [name, samples] of scrape) merged.set(name, [...(merged.get(name) ?? []), ...samples]);
	}
	return merged;
}

const key = (labels: Record<string, string>) =>
	Object.keys(labels)
		.sort()
		.map((k) => `${k}=${labels[k]}`)
		.join(",");

/** The sum of a metric, optionally only over samples whose labels match `where`. */
export function total(
	scrape: Scrape,
	name: string,
	where: (labels: Record<string, string>) => boolean = () => true,
) {
	let sum = 0;
	for (const sample of scrape.get(name) ?? []) if (where(sample.labels)) sum += sample.value;
	return sum;
}

/** Sums a metric grouped by one label. */
export function sumBy(scrape: Scrape, name: string, label: string): Record<string, number> {
	const out: Record<string, number> = {};
	for (const sample of scrape.get(name) ?? []) {
		const group = sample.labels[label] ?? "";
		out[group] = (out[group] ?? 0) + sample.value;
	}
	return out;
}

/**
 * Per-series counter increase between two scrapes. A series whose value dropped was reset (its
 * process restarted), so its whole current value counts as the increase, as PromQL does.
 */
export function increase(previous: Scrape, current: Scrape, name: string): Sample[] {
	const before = new Map((previous.get(name) ?? []).map((s) => [key(s.labels), s.value]));
	return (current.get(name) ?? []).map((sample) => {
		const prior = before.get(key(sample.labels));
		const delta = prior === undefined || sample.value < prior ? sample.value : sample.value - prior;
		return { ...sample, value: delta };
	});
}

/** Sums samples (e.g. the result of `increase`) grouped by one label. */
export function groupSum(samples: Sample[], label: string): Record<string, number> {
	const out: Record<string, number> = {};
	for (const sample of samples) {
		const group = sample.labels[label] ?? "";
		out[group] = (out[group] ?? 0) + sample.value;
	}
	return out;
}

/**
 * The q-quantile (0..1) of a histogram from its `_bucket` samples (already reduced to the window
 * of interest, e.g. by `increase`). Buckets with the same `le` across series are summed first.
 * Linear interpolation within the bucket, like `histogram_quantile`. Null when there are no
 * observations.
 */
export function quantile(q: number, buckets: Sample[]): number | null {
	const byLe = new Map<number, number>();
	for (const sample of buckets) {
		const le = parseValue(sample.labels.le ?? "");
		if (Number.isNaN(le)) continue;
		byLe.set(le, (byLe.get(le) ?? 0) + sample.value);
	}
	const sorted = [...byLe.entries()].sort((a, b) => a[0] - b[0]);
	const count = sorted.at(-1)?.[1] ?? 0;
	if (count <= 0) return null;
	const rank = q * count;
	let lowerBound = 0;
	let lowerCount = 0;
	for (const [le, cumulative] of sorted) {
		if (cumulative >= rank) {
			// The top bucket has no upper bound; report its lower edge, as Prometheus does.
			if (!Number.isFinite(le)) return lowerBound;
			const inBucket = cumulative - lowerCount;
			return inBucket <= 0 ? le : lowerBound + ((le - lowerBound) * (rank - lowerCount)) / inBucket;
		}
		lowerBound = le;
		lowerCount = cumulative;
	}
	return lowerBound;
}
