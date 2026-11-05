import { describe, expect, test } from "bun:test";
import {
	applyDecision,
	candidates,
	compareVersions,
	decide,
	isVersion,
	LKG_FILE,
	type LkgFile,
	overall,
	pinnedVersions,
	repin,
	stableVersions,
	summaryTable,
	type VersionResult,
	windowChanged,
} from "./seaweedfs-lib.ts";

const releases = [
	{ tag_name: "4.50" },
	{ tag_name: "4.53" },
	{ tag_name: "4.54", prerelease: true },
	{ tag_name: "4.52" },
	{ tag_name: "nightly" },
	{ tag_name: "4.55", draft: true },
	{ tag_name: "4.51" },
	{ tag_name: "4.52" },
];

const result = (
	version: string,
	e2e: VersionResult["e2e"] = "pass",
	compose: VersionResult["compose"] = "pass",
) => ({ version, e2e, compose, protoDrift: [] }) satisfies VersionResult;

const files = {
	"mise.toml": '[tools]\n"github:seaweedfs/seaweedfs" = { version = "4.52", bin = "weed" }\n',
	"docker-compose.yml": `  image: chrislusf/seaweedfs:\${SEAWEEDFS_VERSION:-4.52}\n`,
	".env.example": "# pinned\nSEAWEEDFS_VERSION=4.52\n",
};

const lkgFile = (window: LkgFile["window"] = []): LkgFile => ({
	lastKnownGood: "4.52",
	validatedAt: "2026-11-01T00:00:00.000Z",
	kelpCommit: "abc",
	run: "",
	window,
});

describe("versions", () => {
	test("recognises release versions", () => {
		expect(isVersion("4.52")).toBe(true);
		expect(isVersion("4.52.1")).toBe(true);
		expect(isVersion("v4.52")).toBe(false);
		expect(isVersion("latest")).toBe(false);
	});

	test("compares numerically, not as text", () => {
		expect(compareVersions("4.9", "4.10")).toBeLessThan(0);
		expect(compareVersions("4.52.1", "4.52")).toBeGreaterThan(0);
		expect(compareVersions("5.0", "4.99")).toBeGreaterThan(0);
		expect(compareVersions("4.52", "4.52.0")).toBe(0);
		expect(() => compareVersions("4.x", "4.52")).toThrow("not a SeaweedFS release version");
	});

	test("keeps published stable releases, newest first, without duplicates", () => {
		expect(stableVersions(releases)).toEqual(["4.53", "4.52", "4.51", "4.50"]);
	});
});

describe("candidates", () => {
	test("validates the newest releases plus the current LKG as a baseline", () => {
		expect(candidates(releases, "4.50", 2)).toEqual(["4.53", "4.52", "4.50"]);
	});

	test("does not repeat the LKG when it is already in the window", () => {
		expect(candidates(releases, "4.52", 3)).toEqual(["4.53", "4.52", "4.51"]);
	});

	test("always validates at least one release", () => {
		expect(candidates(releases, "4.53", 0)).toEqual(["4.53"]);
	});
});

describe("decide", () => {
	test("a result passes only when every check passes", () => {
		expect(overall(result("4.52"))).toBe("pass");
		expect(overall(result("4.52", "fail"))).toBe("fail");
		expect(overall(result("4.52", "pass", "fail"))).toBe("fail");
		expect(overall(result("4.52", "pass", "pending"))).toBe("pending");
		expect(overall(result("4.52", "pending", "pass"))).toBe("pending");
	});

	test("promotes the newest passing version above the LKG", () => {
		const decision = decide([result("4.52"), result("4.54"), result("4.53")], "4.52");
		expect(decision.promote).toBe("4.54");
		expect(decision.regressions).toEqual([]);
		expect(decision.window.map((w) => w.version)).toEqual(["4.54", "4.53", "4.52"]);
	});

	test("falls back to an older passing release when the newest fails, and reports the failure", () => {
		const decision = decide([result("4.54", "fail"), result("4.53"), result("4.52")], "4.52");
		expect(decision.promote).toBe("4.53");
		expect(decision.regressions).toEqual(["4.54"]);
	});

	test("never moves the LKG backwards", () => {
		const decision = decide([result("4.52", "fail", "pass"), result("4.51")], "4.53");
		expect(decision.promote).toBeNull();
		expect(decision.regressions).toEqual([]);
	});

	test("waits while the Docker image of a new release is not published yet", () => {
		const decision = decide([result("4.53", "pass", "pending"), result("4.52")], "4.52");
		expect(decision.promote).toBeNull();
		expect(decision.regressions).toEqual([]);
	});

	test("does not promote when the baseline itself fails", () => {
		const decision = decide([result("4.53"), result("4.52", "fail")], "4.52");
		expect(decision.baselineFailed).toBe(true);
		expect(decision.promote).toBeNull();
	});

	test("records proto drift in a stable order", () => {
		const decision = decide([{ ...result("4.53"), protoDrift: ["master.proto", "filer.proto"] }], "4.52");
		expect(decision.window[0]?.protoDrift).toEqual(["filer.proto", "master.proto"]);
	});
});

describe("pins", () => {
	test("rewrites every pinned file to the new version", () => {
		expect(repin("mise.toml", files["mise.toml"], "4.53")).toContain('{ version = "4.53", bin = "weed" }');
		expect(repin("docker-compose.yml", files["docker-compose.yml"], "4.53")).toContain(
			`chrislusf/seaweedfs:\${SEAWEEDFS_VERSION:-4.53}`,
		);
		expect(repin(".env.example", files[".env.example"], "4.53")).toBe("# pinned\nSEAWEEDFS_VERSION=4.53\n");
	});

	test("refuses files without a pin, so a moved pin is never skipped silently", () => {
		expect(() => repin("mise.toml", "[tools]\n", "4.53")).toThrow("No SeaweedFS pin found in mise.toml");
		expect(() => repin("README.md", "", "4.53")).toThrow("README.md has no SeaweedFS pin");
	});

	test("reads the pinned version from each file", () => {
		expect(pinnedVersions(files)).toEqual({
			"mise.toml": "4.52",
			"docker-compose.yml": "4.52",
			".env.example": "4.52",
		});
		expect(pinnedVersions({})).toEqual({
			"mise.toml": null,
			"docker-compose.yml": null,
			".env.example": null,
		});
	});
});

describe("applyDecision", () => {
	const meta = { now: "2026-11-06T03:00:00.000Z", commit: "def", run: "https://example.test/runs/1" };

	test("a promotion rewrites the LKG file and every pin", () => {
		const decision = decide([result("4.53"), result("4.52")], "4.52");
		const out = applyDecision(lkgFile(), decision, meta, files);
		expect(Object.keys(out).sort()).toEqual([".env.example", "docker-compose.yml", "mise.toml", LKG_FILE]);
		const lkg = JSON.parse(out[LKG_FILE] as string) as LkgFile;
		expect(lkg).toMatchObject({
			lastKnownGood: "4.53",
			validatedAt: meta.now,
			kelpCommit: "def",
			run: meta.run,
		});
		expect(lkg.window).toHaveLength(2);
		expect(pinnedVersions({ ...files, ...out })).toEqual({
			"mise.toml": "4.53",
			"docker-compose.yml": "4.53",
			".env.example": "4.53",
		});
	});

	test("a promotion fails loudly if a pinned file is missing", () => {
		const decision = decide([result("4.53"), result("4.52")], "4.52");
		expect(() => applyDecision(lkgFile(), decision, meta, { "mise.toml": files["mise.toml"] })).toThrow(
			"docker-compose.yml is missing",
		);
	});

	test("without a promotion, only a changed window is written, keeping the LKG metadata", () => {
		const decision = decide([result("4.53", "fail"), result("4.52")], "4.52");
		const out = applyDecision(lkgFile(), decision, meta, files);
		expect(Object.keys(out)).toEqual([LKG_FILE]);
		const lkg = JSON.parse(out[LKG_FILE] as string) as LkgFile;
		expect(lkg).toMatchObject({
			lastKnownGood: "4.52",
			validatedAt: "2026-11-01T00:00:00.000Z",
			kelpCommit: "abc",
		});
		expect(lkg.window.map((w) => w.result)).toEqual(["fail", "pass"]);
	});

	test("an unchanged window writes nothing", () => {
		const decision = decide([result("4.52")], "4.52");
		expect(applyDecision(lkgFile(decision.window), decision, meta, files)).toEqual({});
		expect(windowChanged(decision.window, decision.window)).toBe(false);
	});
});

test("the summary table marks the current and new LKG and lists proto drift", () => {
	const decision = decide(
		[{ ...result("4.53"), protoDrift: ["filer.proto"] }, result("4.52"), result("4.51", "fail", "pending")],
		"4.52",
	);
	const table = summaryTable(decision, "4.52");
	expect(table).toContain("| 4.53 (new LKG) | ✅ pass | ✅ pass | ✅ pass | filer.proto |");
	expect(table).toContain("| 4.52 (current LKG) | ✅ pass | ✅ pass | ✅ pass | none |");
	expect(table).toContain("| 4.51 | ❌ fail | ❌ fail | ⏳ pending | none |");
});
