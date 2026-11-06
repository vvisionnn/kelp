import { beforeEach, describe, expect, test } from "bun:test";
import { isStaleBuildError, reloadForNewBuild } from "./stale-build.ts";

describe("stale build", () => {
	beforeEach(() => sessionStorage.clear());

	test("recognises a page file that a newer build replaced, in every browser's words", () => {
		expect(
			isStaleBuildError(new TypeError("Failed to fetch dynamically imported module: /assets/tables-1.js")),
		).toBe(true);
		expect(isStaleBuildError(new TypeError("Importing a module script failed."))).toBe(true);
		expect(isStaleBuildError(new TypeError("error loading dynamically imported module"))).toBe(true);
		expect(isStaleBuildError(new Error("Unable to preload CSS for /assets/tables-1.css"))).toBe(true);
		expect(isStaleBuildError(new Error("SeaweedFS master is unreachable"))).toBe(false);
		expect(isStaleBuildError("Failed to fetch dynamically imported module")).toBe(false);
	});

	test("reloads once into the new build, and never loops if the reload doesn't help", () => {
		const reloads: number[] = [];
		const reload = () => reloads.push(1);
		expect(reloadForNewBuild(reload, 1_000)).toBe(true);
		expect(reloadForNewBuild(reload, 2_000)).toBe(false);
		expect(reloads).toHaveLength(1);
		// Much later, a newer deploy may need another reload.
		expect(reloadForNewBuild(reload, 120_000)).toBe(true);
		expect(reloads).toHaveLength(2);
	});

	test("uses the current time by default", () => {
		const reloads: number[] = [];
		expect(reloadForNewBuild(() => reloads.push(1))).toBe(true);
		expect(reloadForNewBuild(() => reloads.push(1))).toBe(false);
		expect(reloads).toHaveLength(1);
	});
});
