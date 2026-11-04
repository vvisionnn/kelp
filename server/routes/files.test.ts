import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type Harness, harness } from "../../test/harness.ts";
import { encodePath, filerPath, isProtectedPath } from "./files.ts";

const fixture = (name: string) => Bun.file(`${import.meta.dir}/../../fixtures/${name}.json`).json();

let h: Harness;
beforeEach(async () => {
	h = await harness();
	h.filer.on("GET *", async (request: Request, recorded: { path: string; query: Record<string, string> }) => {
		if (recorded.query.metadata === "true") {
			if (recorded.path === "/projects/kelp/notes.txt")
				return Response.json(await fixture("filer/meta-tagged"));
			if (recorded.path === "/projects/kelp/docs") {
				return Response.json({
					...(await fixture("filer/meta-tagged")),
					FullPath: "/projects/kelp/docs",
					Mode: 2147484153,
					chunks: null,
					Extended: null,
				});
			}
			return new Response("", { status: 404 });
		}
		if (recorded.path === "/projects/kelp/") {
			return Response.json(
				await fixture(recorded.query.lastFileName ? "filer/list-page2" : "filer/list-page1"),
			);
		}
		if (recorded.path === "/empty/")
			return Response.json({ Path: "/empty", Entries: null, ShouldDisplayLoadMore: false });
		if (recorded.path === "/projects/kelp/notes.txt") {
			const range = request.headers.get("range");
			return new Response(range ? "hel" : "hello kelp", {
				status: range ? 206 : 200,
				headers: {
					"content-type": "text/plain",
					...(range ? { "content-range": "bytes 0-2/10" } : {}),
					etag: '"abc"',
				},
			});
		}
		if (recorded.path === "/site/index.html") {
			return new Response("<script>alert(1)</script>", { headers: { "content-type": "text/html" } });
		}
		if (recorded.path === "/photos/cat.png")
			return new Response("png", { headers: { "content-type": "image/png" } });
		if (recorded.path === "/photos/odd.bin") return new Response("bytes");
		if (recorded.path === "/broken") return new Response("disk on fire", { status: 500 });
		return new Response("", { status: 404 });
	});
	h.filer.on("PUT *", (_request: Request, recorded: { body: string }) =>
		Response.json({ name: "x", size: recorded.body.length }, { status: 201 }),
	);
	h.filer.on("POST *", () => new Response(null, { status: 201 }));
	h.filer.on("DELETE *", (_request: Request, recorded: { path: string }) =>
		recorded.path === "/locked"
			? Response.json({ error: "permission denied" }, { status: 403 })
			: new Response(null, { status: 204 }),
	);
});
afterEach(() => h.stop());

describe("listing", () => {
	test("pages through a folder with a cursor", async () => {
		const first = await h.json("GET", "/files/list?path=/projects/kelp&limit=2");
		expect(first.status).toBe(200);
		expect(
			first.body.entries.map((e: { name: string; isDirectory: boolean }) => [e.name, e.isDirectory]),
		).toEqual([
			["data.json", false],
			["docs", true],
		]);
		expect(first.body.entries[0]).toMatchObject({ ttlSeconds: 604800, mime: "application/json", chunks: 1 });
		expect(first.body.nextCursor).toBe("docs");
		expect(h.filer.requests.at(-1)?.query).toEqual({ limit: "2" });

		const second = await h.json("GET", "/files/list?path=/projects/kelp/&limit=2&cursor=docs");
		expect(second.body.entries.map((e: { name: string }) => e.name)).toEqual(["notes.txt"]);
		expect(second.body.nextCursor).toBeNull();
		expect(h.filer.requests.at(-1)?.query).toEqual({ limit: "2", lastFileName: "docs" });
	});

	test("lists the root and empty folders", async () => {
		h.filer.on("GET /", () => Response.json({ Path: "/", Entries: [], ShouldDisplayLoadMore: false }));
		expect((await h.json("GET", "/files/list")).body).toEqual({ path: "/", entries: [], nextCursor: null });
		expect((await h.json("GET", "/files/list?path=/empty")).body.entries).toEqual([]);
	});

	test("explains missing folders and rejects unsafe paths", async () => {
		const missing = await h.json("GET", "/files/list?path=/nope");
		expect(missing).toEqual({
			status: 404,
			body: { error: "The folder /nope does not exist", upstream: "filer" },
		});
		expect((await h.json("GET", "/files/list?path=/a/../etc")).status).toBe(400);
		expect((await h.json("GET", "/files/list?path=relative")).status).toBe(400);
		expect((await h.json("GET", "/files/list?path=/x&limit=5000")).status).toBe(400);
	});

	test("other filer failures pass through", async () => {
		h.filer.on("GET *", () => new Response("overloaded", { status: 503 }));
		expect((await h.json("GET", "/files/list?path=/x")).status).toBe(503);
		expect((await h.json("GET", "/files/entry?path=/x")).status).toBe(503);
	});
});

describe("details", () => {
	test("decodes tags and chunk placement", async () => {
		const { body } = await h.json("GET", "/files/entry?path=/projects/kelp/notes.txt");
		expect(body).toMatchObject({
			name: "notes.txt",
			isDirectory: false,
			tags: { Team: "storage" },
			attributes: {},
		});
		expect(body.chunkList[0]).toMatchObject({ volumeId: expect.any(Number), size: 10 });
		expect(body.md5).toMatch(/^[0-9a-f]{32}$/);
	});

	test("missing entries are 404s", async () => {
		const { status, body } = await h.json("GET", "/files/entry?path=/gone.txt");
		expect(status).toBe(404);
		expect(body.error).toBe("/gone.txt does not exist");
	});
});

describe("content", () => {
	test("streams with range support and download names", async () => {
		const partial = await h.request("GET", "/files/content?path=/projects/kelp/notes.txt", undefined, {
			range: "bytes=0-2",
		});
		expect(partial.status).toBe(206);
		expect(await partial.text()).toBe("hel");
		expect(partial.headers.get("content-range")).toBe("bytes 0-2/10");
		expect(h.filer.requests.at(-1)?.headers.get("range")).toBe("bytes=0-2");

		const download = await h.request("GET", "/files/content?path=/projects/kelp/notes.txt&download=1");
		expect(download.headers.get("content-disposition")).toBe(
			`attachment; filename="notes.txt"; filename*=UTF-8''notes.txt`,
		);
		expect(download.headers.get("etag")).toBe('"abc"');
		expect(download.headers.get("content-security-policy")).toContain("sandbox");
	});

	test("anything a browser could execute is sandboxed; media is not", async () => {
		const html = await h.request("GET", "/files/content?path=/site/index.html");
		expect(html.headers.get("content-security-policy")).toContain("sandbox");
		expect(html.headers.get("x-content-type-options")).toBe("nosniff");
		const image = await h.request("GET", "/files/content?path=/photos/cat.png");
		expect(image.headers.get("content-security-policy")).toBeNull();
		expect(image.headers.get("content-disposition")).toStartWith("inline;");
		const unknown = await h.request("GET", "/files/content?path=/photos/odd.bin");
		expect(unknown.headers.get("content-security-policy")).toContain("sandbox");
	});

	test("non-ASCII names are encoded for Content-Disposition", async () => {
		h.filer.on("GET *", () => new Response("x", { headers: { "content-type": "text/plain" } }));
		const response = await h.request(
			"GET",
			`/files/content?path=${encodeURIComponent('/docs/résumé "v2".txt')}&download=1`,
		);
		expect(response.headers.get("content-disposition")).toBe(
			`attachment; filename="r_sum_ _v2_.txt"; filename*=UTF-8''r%C3%A9sum%C3%A9%20%22v2%22.txt`,
		);
	});

	test("missing and failing files", async () => {
		expect((await h.json("GET", "/files/content?path=/nope.txt")).status).toBe(404);
		const broken = await h.json("GET", "/files/content?path=/broken");
		expect(broken).toEqual({ status: 500, body: { error: "disk on fire", upstream: "filer" } });
	});

	test("an unreachable filer is a 502", async () => {
		await h.filer.stop();
		const { status, body } = await h.json("GET", "/files/content?path=/x");
		expect(status).toBe(502);
		expect(body.error).toStartWith("filer is unreachable");
	});
});

describe("writes", () => {
	test("uploads stream to the filer with type and TTL", async () => {
		const response = await h.request(
			"POST",
			"/files/upload?path=/projects/kelp&name=a%20b.txt&ttl=7d",
			undefined,
			{
				"content-type": "text/plain",
			},
		);
		expect(response.status).toBe(201);
		const upload = await h.app.request("/api/files/upload?path=/&name=root.txt", {
			method: "POST",
			headers: { cookie: (await loginCookie()) ?? "", "x-kelp-csrf": "1", "content-type": "text/plain" },
			body: "hello",
		});
		expect(await upload.json()).toEqual({ path: "/root.txt", size: 5 });
		const put = h.filer.requests.filter((r) => r.method === "PUT");
		expect(put[0]).toMatchObject({ path: "/projects/kelp/a b.txt", query: { ttl: "7d" } });
		expect(put[0]?.headers.get("content-type")).toBe("text/plain");
		expect(put[1]).toMatchObject({ path: "/root.txt", body: "hello", query: {} });
	});

	test("upload names and TTLs are validated", async () => {
		expect((await h.request("POST", "/files/upload?path=/x&name=a/b")).status).toBe(400);
		expect((await h.request("POST", "/files/upload?path=/x&name=..")).status).toBe(400);
		expect((await h.request("POST", "/files/upload?path=/x&name=a&ttl=forever")).status).toBe(400);
	});

	test("creates folders", async () => {
		expect((await h.json("POST", "/files/folder", { parent: "/projects", name: "new #1" })).body).toEqual({
			path: "/projects/new #1",
		});
		expect(h.filer.last("POST", "/projects/new #1/")).toBeTruthy();
		expect((await h.json("POST", "/files/folder", { parent: "/", name: "top" })).body.path).toBe("/top");
	});

	test("moves and renames, refusing protected or circular moves", async () => {
		const moved = await h.json("POST", "/files/move", {
			from: "/projects/kelp/notes.txt",
			to: "/projects/notes.txt",
		});
		expect(moved.body).toEqual({ path: "/projects/notes.txt" });
		expect(h.filer.last("POST", "/projects/notes.txt")?.query).toEqual({
			"mv.from": "/projects/kelp/notes.txt",
		});

		expect((await h.json("POST", "/files/move", { from: "/buckets/media", to: "/x" })).status).toBe(400);
		const circular = await h.json("POST", "/files/move", {
			from: "/projects/kelp/docs",
			to: "/projects/kelp/docs/inner",
		});
		expect(circular.body.error).toBe("Choose a destination outside the item you are moving");
		expect((await h.json("POST", "/files/move", { from: "/missing.txt", to: "/b.txt" })).status).toBe(404);
	});

	test("deletes recursively and reports each failure", async () => {
		const { body } = await h.json("POST", "/files/delete", {
			paths: ["/projects/kelp/docs", "/locked", "/buckets/media", "/topics"],
		});
		expect(body.deleted).toEqual(["/projects/kelp/docs"]);
		expect(body.failed).toEqual([
			{ path: "/locked", error: "permission denied" },
			{ path: "/buckets/media", error: "Delete buckets from the Buckets page" },
			{ path: "/topics", error: "This folder belongs to SeaweedFS" },
		]);
		expect(h.filer.last("DELETE", "/projects/kelp/docs")?.query).toEqual({
			recursive: "true",
			ignoreRecursiveError: "false",
		});
	});

	test("replaces tags on files only", async () => {
		const { status } = await h.json("PUT", "/files/tags", {
			path: "/projects/kelp/notes.txt",
			tags: { env: "prod" },
		});
		expect(status).toBe(200);
		expect(h.filer.last("DELETE", "/projects/kelp/notes.txt")?.query).toEqual({ tagging: "Team" });
		expect(h.filer.last("PUT", "/projects/kelp/notes.txt")?.headers.get("seaweed-env")).toBe("prod");

		const cleared = await h.json("PUT", "/files/tags", { path: "/projects/kelp/notes.txt", tags: {} });
		expect(cleared.status).toBe(200);
		expect((await h.json("PUT", "/files/tags", { path: "/projects/kelp/docs", tags: {} })).body.error).toBe(
			"Tags can only be set on files",
		);
		expect((await h.json("PUT", "/files/tags", { path: "/x", tags: { "bad key": "v" } })).status).toBe(400);
	});

	test("viewers cannot write", async () => {
		const viewer = await harness({ role: "viewer" });
		expect((await viewer.json("POST", "/files/delete", { paths: ["/x"] })).status).toBe(403);
		await viewer.stop();
	});
});

describe("path helpers", () => {
	test("normalizes and encodes paths", () => {
		expect(filerPath.parse("/a//b/")).toBe("/a/b");
		expect(filerPath.parse("/")).toBe("/");
		expect(encodePath("/a b/#1?x")).toBe("/a%20b/%231%3Fx");
	});

	test("protects the root, system folders and bucket roots", () => {
		for (const path of ["/", "/buckets", "/topics", "/etc", "/buckets/media"])
			expect(isProtectedPath(path)).toBe(true);
		for (const path of ["/buckets/media/a.txt", "/etcetera", "/data"])
			expect(isProtectedPath(path)).toBe(false);
	});
});

async function loginCookie() {
	const response = await h.app.request("/api/auth/login", {
		method: "POST",
		headers: { "content-type": "application/json", "x-kelp-csrf": "1" },
		body: JSON.stringify({ username: "admin", password: "admin-pass" }),
	});
	return response.headers.get("set-cookie")?.split(";")[0];
}
