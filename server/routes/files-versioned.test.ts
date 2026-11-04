import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type Harness, harness } from "../../test/harness.ts";

/** Real filer responses from a versioned SeaweedFS 4.52 bucket (media-assets). */
const fixture = (name: string) => Bun.file(`${import.meta.dir}/../../fixtures/filer/${name}.json`).json();
const LATEST = "v_671b208f0502dc37d2cda9db679097e4";
const BASE = "/buckets/media-assets";

let h: Harness;
beforeEach(async () => {
	h = await harness();
	h.filer.on(
		"GET *",
		async (_request: Request, recorded: { path: string; query: Record<string, string> }) => {
			const { path, query } = recorded;
			if (query.metadata === "true") {
				if (path === `${BASE}/README.md.versions`) return Response.json(await fixture("versioned-dir-meta"));
				if (path === `${BASE}/README.md.versions/${LATEST}`)
					return Response.json(await fixture("versioned-meta"));
				return new Response("", { status: 404 });
			}
			if (path === `${BASE}/`) return Response.json(await fixture("versioned-list"));
			if (path === `${BASE}/brand/`) return Response.json(await fixture("versioned-list-deleted"));
			if (path === `${BASE}/README.md.versions/`) return Response.json(await fixture("versioned-versions"));
			if (path === `${BASE}/README.md.versions/${LATEST}`) {
				return new Response("# Media assets", { headers: { "content-type": "text/markdown" } });
			}
			return new Response("", { status: 404 });
		},
	);
	h.filer.on("POST *", () => new Response(null, { status: 201 }));
	h.filer.on("DELETE *", () => new Response(null, { status: 204 }));
	h.filer.on("PUT *", () => new Response(null, { status: 201 }));
});
afterEach(() => h.stop());

describe("versioned buckets", () => {
	test("list objects, not their .versions folders", async () => {
		const { body } = await h.json("GET", `/files/list?path=${BASE}`);
		const readme = body.entries.find((e: { name: string }) => e.name === "README.md");
		expect(readme).toMatchObject({
			path: `${BASE}/README.md`,
			isDirectory: false,
			size: 85,
			md5: expect.any(String),
			versionId: "671b208f0502dc37d2cda9db679097e4",
		});
		expect(readme.modifiedAt).toStartWith("2026-");
		expect(body.entries.map((e: { name: string }) => e.name)).toEqual([
			"README.md",
			"brand",
			"hero",
			"thumbnails",
		]);
	});

	test("objects whose latest version is a delete marker are hidden", async () => {
		const { body } = await h.json("GET", `/files/list?path=${BASE}/brand`);
		expect(body.entries.map((e: { name: string }) => e.name)).toEqual([
			"frond-165.svg",
			"frond-180.svg",
			"frond-195.svg",
		]);
	});

	test("properties come from the latest version and list every version", async () => {
		const { status, body } = await h.json("GET", `/files/entry?path=${BASE}/README.md`);
		expect(status).toBe(200);
		expect(body).toMatchObject({
			name: "README.md",
			path: `${BASE}/README.md`,
			size: 85,
			mime: "text/markdown",
		});
		expect(body.versions).toHaveLength(2);
		expect(body.versions[0]).toMatchObject({
			versionId: "671b208f0502dc37d2cda9db679097e4",
			isLatest: true,
			size: 85,
		});
		expect(body.versions[1]).toMatchObject({ isLatest: false, size: 77 });
		// SeaweedFS bookkeeping is not a user tag.
		expect(body.tags).toEqual({});
		expect(Object.keys(body.attributes)).toContain("Seaweed-X-Amz-Version-Id");
	});

	test("content streams the latest version", async () => {
		const response = await h.get(`/files/content?path=${encodeURIComponent(`${BASE}/README.md`)}`);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("# Media assets");
		expect(response.headers.get("content-disposition")).toContain("README.md");
	});

	test("older versions download by id; ids are validated", async () => {
		h.filer.on(
			`GET ${BASE}/README.md.versions/v_671b20f69278625fd8f3541fb609bcc7`,
			() => new Response("old readme"),
		);
		const old = await h.get(
			`/files/content?path=${encodeURIComponent(`${BASE}/README.md`)}&versionId=671b20f69278625fd8f3541fb609bcc7`,
		);
		expect(await old.text()).toBe("old readme");
		const bad = await h.get(
			`/files/content?path=${encodeURIComponent(`${BASE}/README.md`)}&versionId=../../etc`,
		);
		expect(bad.status).toBe(400);
		const missing = await h.get(
			`/files/content?path=${encodeURIComponent(`${BASE}/README.md`)}&versionId=nope`,
		);
		expect(missing.status).toBe(404);
	});

	test("delete and move act on the whole object, with all its versions", async () => {
		await h.json("POST", "/files/delete", { paths: [`${BASE}/README.md`] });
		expect(h.filer.last("DELETE", `${BASE}/README.md.versions`)).toBeTruthy();
		await h.json("POST", "/files/move", { from: `${BASE}/README.md`, to: `${BASE}/docs/README.md` });
		const move = h.filer.last("POST", `${BASE}/docs/README.md.versions`);
		expect(move?.query["mv.from"]).toBe(`${BASE}/README.md.versions`);
	});

	test("plain files still resolve directly", async () => {
		const { status } = await h.json("GET", `/files/entry?path=${BASE}/missing.txt`);
		expect(status).toBe(404);
	});
});
