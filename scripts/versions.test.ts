import { expect, test } from "bun:test";
import { isVersion, LKG_FILE, type LkgFile, PINS, pinnedVersions } from "./seaweedfs-lib.ts";

const root = `${import.meta.dir}/..`;

test("every SeaweedFS pin matches the last-known-good version in seaweedfs-lkg.json", async () => {
	const lkg = (await Bun.file(`${root}/${LKG_FILE}`).json()) as LkgFile;
	expect(isVersion(lkg.lastKnownGood)).toBe(true);
	const files = Object.fromEntries(
		await Promise.all(PINS.map(async (p) => [p.file, await Bun.file(`${root}/${p.file}`).text()] as const)),
	);
	for (const [file, version] of Object.entries(pinnedVersions(files))) {
		expect({ file, version }).toEqual({ file, version: lkg.lastKnownGood });
	}
});

test("the Docker image uses the Bun version the project pins", async () => {
	const pkg = await Bun.file(`${root}/package.json`).json();
	const dockerfile = await Bun.file(`${root}/Dockerfile`).text();
	expect(dockerfile).toContain(`ARG BUN_VERSION=${String(pkg.packageManager).replace("bun@", "")}`);
});
