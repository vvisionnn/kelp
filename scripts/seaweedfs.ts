/**
 * SeaweedFS compatibility tooling, used by .github/workflows/seaweedfs-compat.yml and by hand.
 *
 *   bun scripts/seaweedfs.ts candidates [--count 3] [--versions 4.53,4.54]   JSON list to validate
 *   bun scripts/seaweedfs.ts image-exists <version>                         exit 1 if not on Docker Hub
 *   bun scripts/seaweedfs.ts proto-drift <version>                          vendored protos that differ
 *   bun scripts/seaweedfs.ts result --version V --e2e O --compose O --proto-drift JSON --out FILE
 *   bun scripts/seaweedfs.ts decide --results DIR [--apply]                 summary, outputs, LKG update
 *   bun scripts/seaweedfs.ts promote <version>                              pin a version by hand
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
	applyDecision,
	candidates,
	decide,
	isVersion,
	LKG_FILE,
	type LkgFile,
	type Outcome,
	PINS,
	type Release,
	summaryTable,
	type VersionResult,
} from "./seaweedfs-lib.ts";

const root = join(import.meta.dir, "..");
const UPSTREAM = "seaweedfs/seaweedfs";

const { positionals, values } = parseArgs({
	allowPositionals: true,
	options: {
		count: { type: "string", default: "3" },
		versions: { type: "string" },
		version: { type: "string" },
		e2e: { type: "string" },
		compose: { type: "string" },
		"proto-drift": { type: "string", default: "[]" },
		out: { type: "string" },
		results: { type: "string" },
		apply: { type: "boolean", default: false },
	},
});

const readLkg = async () => (await Bun.file(join(root, LKG_FILE)).json()) as LkgFile;

async function github(path: string): Promise<Response> {
	const headers: Record<string, string> = { accept: "application/vnd.github+json" };
	if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
	const response = await fetch(`https://api.github.com${path}`, { headers });
	if (!response.ok) throw new Error(`GitHub ${path}: ${response.status} ${await response.text()}`);
	return response;
}

function outcome(value: string | undefined, name: string): Outcome {
	if (value === "success" || value === "pass") return "pass";
	if (value === "failure" || value === "fail" || value === "cancelled") return "fail";
	if (value === "skipped" || value === "pending") return "pending";
	throw new Error(
		`--${name} must be an outcome (success, failure, skipped, pass, fail, pending), got "${value}"`,
	);
}

/** Appends `key=value` lines for later workflow steps; prints them when run by hand. */
async function setOutputs(outputs: Record<string, string>) {
	const lines = Object.entries(outputs).map(([k, v]) => `${k}=${v}`);
	const file = process.env.GITHUB_OUTPUT;
	if (file)
		await Bun.write(
			file,
			`${await Bun.file(file)
				.text()
				.catch(() => "")}${lines.join("\n")}\n`,
		);
	else console.log(lines.join("\n"));
}

async function summary(markdown: string) {
	const file = process.env.GITHUB_STEP_SUMMARY;
	if (file)
		await Bun.write(
			file,
			`${await Bun.file(file)
				.text()
				.catch(() => "")}${markdown}\n`,
		);
	console.log(markdown);
}

/** Writes the files, then formats them the way CI's lint expects. */
async function writeFiles(out: Record<string, string>) {
	const files = Object.keys(out);
	if (files.length === 0) return;
	for (const file of files) await Bun.write(join(root, file), out[file] as string);
	const format = Bun.spawn(
		["bunx", "biome", "format", "--write", ...files.filter((f) => f.endsWith(".json"))],
		{
			cwd: root,
			stdout: "ignore",
			stderr: "inherit",
		},
	);
	if ((await format.exited) !== 0) throw new Error("biome format failed");
}

async function readPinnedFiles() {
	return Object.fromEntries(
		await Promise.all(PINS.map(async (p) => [p.file, await Bun.file(join(root, p.file)).text()] as const)),
	);
}

const command = positionals[0];
switch (command) {
	case "candidates": {
		const lkg = (await readLkg()).lastKnownGood;
		let releases: Release[];
		if (values.versions) {
			releases = values.versions.split(",").map((v) => ({ tag_name: v.trim() }));
			const bad = releases.find((r) => !isVersion(r.tag_name));
			if (bad) throw new Error(`"${bad.tag_name}" is not a SeaweedFS release version`);
		} else {
			releases = (await (await github(`/repos/${UPSTREAM}/releases?per_page=30`)).json()) as Release[];
		}
		const count = values.versions ? releases.length : Number(values.count);
		console.log(JSON.stringify(candidates(releases, lkg, count)));
		break;
	}

	case "image-exists": {
		const version = positionals[1] ?? "";
		const response = await fetch(
			`https://hub.docker.com/v2/repositories/chrislusf/seaweedfs/tags/${version}`,
		);
		console.log(
			response.ok
				? `chrislusf/seaweedfs:${version} is published`
				: `chrislusf/seaweedfs:${version} is not published yet`,
		);
		process.exit(response.ok ? 0 : 1);
		break;
	}

	case "proto-drift": {
		const version = positionals[1] ?? "";
		const vendored = (await readdir(join(root, "proto"))).filter((f) => f.endsWith(".proto")).sort();
		const drift: string[] = [];
		for (const file of vendored) {
			const url = `https://raw.githubusercontent.com/${UPSTREAM}/${version}/weed/pb/${file}`;
			const response = await fetch(url);
			if (!response.ok) {
				drift.push(`${file} (missing upstream)`);
				continue;
			}
			if ((await response.text()) !== (await Bun.file(join(root, "proto", file)).text())) drift.push(file);
		}
		console.log(JSON.stringify(drift));
		break;
	}

	case "result": {
		if (!values.version || !isVersion(values.version)) throw new Error("--version must be a release version");
		if (!values.out) throw new Error("--out is required");
		const result: VersionResult = {
			version: values.version,
			e2e: outcome(values.e2e, "e2e"),
			compose: outcome(values.compose, "compose"),
			protoDrift: JSON.parse(values["proto-drift"] as string) as string[],
		};
		await Bun.write(values.out, `${JSON.stringify(result, null, "\t")}\n`);
		console.log(JSON.stringify(result));
		break;
	}

	case "decide": {
		if (!values.results) throw new Error("--results is required");
		const lkg = await readLkg();
		const results: VersionResult[] = [];
		for (const file of (await readdir(values.results, { recursive: true })).filter((f) =>
			f.endsWith(".json"),
		)) {
			results.push((await Bun.file(join(values.results, file)).json()) as VersionResult);
		}
		if (results.length === 0) throw new Error(`No results in ${values.results}`);
		const decision = decide(results, lkg.lastKnownGood);
		const run = process.env.GITHUB_RUN_ID
			? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
			: "";
		const out = applyDecision(
			lkg,
			decision,
			{ now: new Date().toISOString(), commit: (process.env.GITHUB_SHA ?? "local").slice(0, 7), run },
			await readPinnedFiles(),
		);

		const headline = decision.baselineFailed
			? `The current LKG ${lkg.lastKnownGood} failed too, so nothing was promoted: check Kelp or the runner first.`
			: decision.promote
				? `SeaweedFS ${decision.promote} passed every check and becomes the last-known-good version (was ${lkg.lastKnownGood}).`
				: `The last-known-good version stays ${lkg.lastKnownGood}.`;
		const regressions = decision.regressions.length
			? `\n\nNewer releases that fail: ${decision.regressions.join(", ")}. Kelp needs changes before it can move to them.`
			: "";
		await summary(
			`## SeaweedFS compatibility\n\n${headline}${regressions}\n\n${summaryTable(decision, lkg.lastKnownGood)}\n`,
		);

		if (values.apply) await writeFiles(out);
		await setOutputs({
			promote: decision.promote ?? "",
			regressions: decision.regressions.join(","),
			baseline_failed: String(decision.baselineFailed),
			changed: String(Object.keys(out).length > 0),
			lkg: lkg.lastKnownGood,
			lkg_after: decision.promote ?? lkg.lastKnownGood,
			passed: decision.window
				.filter((w) => w.result === "pass")
				.map((w) => w.version)
				.join(","),
		});
		await Bun.write(
			join(values.results, "..", "issue.md"),
			[
				headline + regressions,
				"",
				summaryTable(decision, lkg.lastKnownGood),
				"",
				run ? `Run: ${run}` : "",
				"",
				"Reproduce locally: `mise install github:seaweedfs/seaweedfs@<version>`, then",
				"`WEED_BIN=$(mise where github:seaweedfs/seaweedfs@<version>)/weed CI=1 bun run e2e`.",
				"This issue closes itself once this version passes, or once the last-known-good version moves to or past it.",
			].join("\n"),
		);
		break;
	}

	case "promote": {
		const version = positionals[1] ?? "";
		if (!isVersion(version)) throw new Error(`"${version}" is not a SeaweedFS release version`);
		const lkg = await readLkg();
		const out = applyDecision(
			lkg,
			{ promote: version, regressions: [], baselineFailed: false, window: lkg.window },
			{ now: new Date().toISOString(), commit: "manual", run: "" },
			await readPinnedFiles(),
		);
		await writeFiles(out);
		console.log(`Pinned SeaweedFS ${version} in ${Object.keys(out).join(", ")}.`);
		break;
	}

	default:
		console.error(
			"Usage: bun scripts/seaweedfs.ts candidates|image-exists|proto-drift|result|decide|promote",
		);
		process.exit(2);
}
