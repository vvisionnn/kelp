/**
 * SeaweedFS compatibility tracking: which upstream releases to validate, how to read their results,
 * and how to move the last-known-good (LKG) pin. The LKG version is what CI, the local stack and
 * docker-compose.yml run, so a release of Kelp always ships with a SeaweedFS version it was tested on.
 */

export const LKG_FILE = "seaweedfs-lkg.json";

/** Upstream release tags look like "4.52"; a patch component ("4.52.1") is accepted too. */
const VERSION = /^(\d+)\.(\d+)(?:\.(\d+))?$/;

export function isVersion(value: string): boolean {
	return VERSION.test(value);
}

function parts(version: string): [number, number, number] {
	const match = VERSION.exec(version);
	if (!match) throw new Error(`"${version}" is not a SeaweedFS release version`);
	return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

/** Negative when a is older than b, positive when newer, 0 when equal. */
export function compareVersions(a: string, b: string): number {
	const [x, y] = [parts(a), parts(b)];
	for (let i = 0; i < 3; i++) {
		const diff = (x[i] as number) - (y[i] as number);
		if (diff !== 0) return diff;
	}
	return 0;
}

export interface Release {
	tag_name: string;
	draft?: boolean;
	prerelease?: boolean;
}

/** Published, stable release versions, newest first. */
export function stableVersions(releases: Release[]): string[] {
	const versions = releases
		.filter((r) => !r.draft && !r.prerelease && isVersion(r.tag_name))
		.map((r) => r.tag_name);
	return [...new Set(versions)].sort((a, b) => compareVersions(b, a));
}

/**
 * The versions one run validates: the newest `count` stable releases, plus the current LKG as a
 * baseline. If the baseline fails too, the problem is Kelp or the runner, not the new release.
 */
export function candidates(releases: Release[], lkg: string, count: number): string[] {
	const window = stableVersions(releases).slice(0, Math.max(1, count));
	if (!window.includes(lkg)) window.push(lkg);
	return window.sort((a, b) => compareVersions(b, a));
}

export type Outcome = "pass" | "fail" | "pending";

/** What one validation job found for one SeaweedFS version. */
export interface VersionResult {
	version: string;
	/** Playwright suite against the native `weed` binary. */
	e2e: Outcome;
	/** docker-compose.yml with the `chrislusf/seaweedfs:<version>` image; pending until it is published. */
	compose: Outcome;
	/** Vendored proto files that differ from upstream at this version. Informational. */
	protoDrift: string[];
}

export function overall(result: VersionResult): Outcome {
	if (result.e2e === "fail" || result.compose === "fail") return "fail";
	if (result.e2e === "pending" || result.compose === "pending") return "pending";
	return "pass";
}

export interface WindowEntry {
	version: string;
	result: Outcome;
	e2e: Outcome;
	compose: Outcome;
	protoDrift: string[];
}

export interface LkgFile {
	/** The newest SeaweedFS release that passed every check. Everything else pins to this. */
	lastKnownGood: string;
	validatedAt: string;
	/** The Kelp commit and workflow run that validated it. */
	kelpCommit: string;
	run: string;
	/** Results from the latest run, newest version first. */
	window: WindowEntry[];
}

export interface Decision {
	/** A newer version to pin, if one passed. */
	promote: string | null;
	/** Versions newer than the LKG that fail: each needs a look. */
	regressions: string[];
	/** The LKG itself failed, so this run's results can't be trusted for promotion. */
	baselineFailed: boolean;
	window: WindowEntry[];
}

export function decide(results: VersionResult[], lkg: string): Decision {
	const window = [...results]
		.sort((a, b) => compareVersions(b.version, a.version))
		.map((r) => ({
			version: r.version,
			result: overall(r),
			e2e: r.e2e,
			compose: r.compose,
			protoDrift: [...r.protoDrift].sort(),
		}));
	const baseline = window.find((w) => w.version === lkg);
	const baselineFailed = baseline?.result === "fail";
	const newer = window.filter((w) => compareVersions(w.version, lkg) > 0);
	const promote = baselineFailed ? null : (newer.find((w) => w.result === "pass")?.version ?? null);
	return {
		promote,
		regressions: newer.filter((w) => w.result === "fail").map((w) => w.version),
		baselineFailed,
		window,
	};
}

/** True when the window's outcomes differ from what the file records (ignores timestamps). */
export function windowChanged(previous: WindowEntry[], next: WindowEntry[]): boolean {
	return JSON.stringify(previous) !== JSON.stringify(next);
}

/** The files that pin SeaweedFS, and how to rewrite each to `version`. */
export const PINS: Array<{ file: string; pattern: RegExp; replace: (version: string) => string }> = [
	{
		file: "mise.toml",
		pattern: /("github:seaweedfs\/seaweedfs" = \{ version = ")[^"]+(")/,
		replace: (v) => `$1${v}$2`,
	},
	{
		file: "docker-compose.yml",
		pattern: /(chrislusf\/seaweedfs:\$\{SEAWEEDFS_VERSION:-)[^}]+(\})/,
		replace: (v) => `$1${v}$2`,
	},
	{ file: ".env.example", pattern: /(SEAWEEDFS_VERSION=)\S+/, replace: (v) => `$1${v}` },
];

/** Rewrites one pinned file; throws if the pin is missing so a moved pin can't be skipped silently. */
export function repin(file: string, content: string, version: string): string {
	const pin = PINS.find((p) => p.file === file);
	if (!pin) throw new Error(`${file} has no SeaweedFS pin`);
	if (!pin.pattern.test(content)) throw new Error(`No SeaweedFS pin found in ${file}`);
	return content.replace(pin.pattern, pin.replace(version));
}

/** The pinned version in each file, for consistency checks. */
export function pinnedVersions(files: Record<string, string>): Record<string, string | null> {
	return Object.fromEntries(
		PINS.map((p) => {
			const match = files[p.file]?.match(p.pattern);
			if (!match) return [p.file, null];
			// The version is whatever sits between the pattern's prefix and suffix groups.
			const prefix = match[1] as string;
			const suffix = match[2] ?? "";
			return [p.file, match[0].slice(prefix.length, match[0].length - suffix.length)];
		}),
	);
}

const ICON: Record<Outcome, string> = { pass: "✅ pass", fail: "❌ fail", pending: "⏳ pending" };

/** A Markdown table for the job summary and issues. */
export function summaryTable(decision: Decision, lkg: string): string {
	const rows = decision.window.map((w) => {
		const marks = [w.version === lkg ? "current LKG" : "", w.version === decision.promote ? "new LKG" : ""]
			.filter(Boolean)
			.join(", ");
		const drift = w.protoDrift.length ? w.protoDrift.join(", ") : "none";
		return `| ${w.version}${marks ? ` (${marks})` : ""} | ${ICON[w.result]} | ${ICON[w.e2e]} | ${ICON[w.compose]} | ${drift} |`;
	});
	return [
		"| SeaweedFS | Result | End-to-end (native) | Compose (Docker image) | Proto changes vs vendored |",
		"| --- | --- | --- | --- | --- |",
		...rows,
	].join("\n");
}

/**
 * The file changes a decision implies: a promotion rewrites the LKG file and every pin; otherwise only
 * the recorded window is refreshed, and only when its outcomes changed. Returns the files to write.
 */
export function applyDecision(
	lkg: LkgFile,
	decision: Decision,
	meta: { now: string; commit: string; run: string },
	files: Record<string, string>,
): Record<string, string> {
	const out: Record<string, string> = {};
	if (decision.promote) {
		const next: LkgFile = {
			lastKnownGood: decision.promote,
			validatedAt: meta.now,
			kelpCommit: meta.commit,
			run: meta.run,
			window: decision.window,
		};
		out[LKG_FILE] = `${JSON.stringify(next, null, "\t")}\n`;
		for (const pin of PINS) {
			const content = files[pin.file];
			if (content === undefined) throw new Error(`${pin.file} is missing`);
			out[pin.file] = repin(pin.file, content, decision.promote);
		}
	} else if (windowChanged(lkg.window, decision.window)) {
		out[LKG_FILE] = `${JSON.stringify({ ...lkg, window: decision.window }, null, "\t")}\n`;
	}
	return out;
}
