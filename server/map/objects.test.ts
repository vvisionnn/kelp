import { describe, expect, test } from "bun:test";
import {
	collectionStats,
	decodeAttribute,
	isDirectoryMode,
	mapDetails,
	mapEntry,
	mapPolicy,
} from "./objects.ts";

describe("object store mappers", () => {
	test("tells directories from files by the Go ModeDir bit", () => {
		expect(isDirectoryMode(2147484153)).toBe(true);
		expect(isDirectoryMode(432)).toBe(false);
		expect(mapEntry({ FullPath: "/", Mode: 2147484141 })).toMatchObject({
			name: "/",
			isDirectory: true,
			size: 0,
			mode: 0o755,
		});
	});

	test("decodes text attributes and keeps binary ones as base64", () => {
		expect(decodeAttribute(Buffer.from("hello").toString("base64"))).toBe("hello");
		const binary = Buffer.from([0, 159, 146, 150]).toString("base64");
		expect(decodeAttribute(binary)).toBe(`base64:${binary}`);
	});

	test("splits tags from other attributes and flags remote content", () => {
		const details = mapDetails({
			FullPath: "/a.txt",
			Mode: 420,
			Extended: {
				"Seaweed-Env": Buffer.from("dev").toString("base64"),
				"X-Amz-Meta": Buffer.from("x").toString("base64"),
			},
			Remote: { storage_name: "s3" },
			chunks: [],
		});
		expect(details).toMatchObject({
			tags: { Env: "dev" },
			attributes: { "X-Amz-Meta": "x" },
			remote: true,
			md5: null,
		});
	});

	test("policies and empty stats", () => {
		expect(mapPolicy({ policy: null })).toEqual({ policy: null, invalidText: null });
		expect(collectionStats(null).size).toBe(0);
	});
});
