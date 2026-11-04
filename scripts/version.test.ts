import { describe, expect, test } from "bun:test";
import { nextVersion } from "./version.ts";

describe("nextVersion", () => {
	test("bumps each part and resets the lower ones", () => {
		expect(nextVersion("1.2.3", "patch")).toBe("1.2.4");
		expect(nextVersion("1.2.3", "minor")).toBe("1.3.0");
		expect(nextVersion("1.2.3", "major")).toBe("2.0.0");
	});

	test("a prerelease graduates to its own version", () => {
		expect(nextVersion("1.0.0-rc.1", "major")).toBe("1.0.0");
		expect(nextVersion("1.3.0-rc.1", "minor")).toBe("1.3.0");
		expect(nextVersion("1.3.1-rc.1", "patch")).toBe("1.3.1");
		expect(nextVersion("1.3.1-rc.1", "minor")).toBe("1.4.0");
		expect(nextVersion("1.3.0-rc.1", "major")).toBe("2.0.0");
	});

	test("accepts an explicit version and rejects nonsense", () => {
		expect(nextVersion("0.1.0", "2.0.0-beta.1")).toBe("2.0.0-beta.1");
		expect(() => nextVersion("0.1.0", "huge")).toThrow('Unknown release type "huge"');
		expect(() => nextVersion("one", "patch")).toThrow("not valid semver");
	});
});
