import { Hono } from "hono";
import { z } from "zod";
import type { DeleteResult } from "../../shared/objects.ts";
import type { Env } from "../app.ts";
import { hasControlCharacters, mapDetails, mapEntry, TAG_PREFIX } from "../map/objects.ts";
import { list, num, type Raw, str } from "../map/raw.ts";
import type { Services } from "../services.ts";
import { UpstreamError } from "../upstream/http.ts";

/** An absolute filer path without `.`/`..` segments or control characters. */
export const filerPath = z
	.string()
	.min(1)
	.refine((p) => p.startsWith("/"), "Paths start with /")
	.refine((p) => !hasControlCharacters(p), "Paths cannot contain control characters")
	.refine((p) => p.split("/").every((part) => part !== "." && part !== ".."), "Paths cannot contain . or ..")
	.transform((p) => (p.length > 1 ? p.replace(/\/+$/, "") || "/" : p).replace(/\/{2,}/g, "/"));

const fileName = z
	.string()
	.trim()
	.min(1, "Enter a name")
	.max(255, "Names are at most 255 characters")
	.refine((n) => !n.includes("/"), "Names cannot contain /")
	.refine((n) => n !== "." && n !== "..", "Choose a different name")
	.refine((n) => !hasControlCharacters(n), "Names cannot contain control characters");

/** SeaweedFS TTL syntax: a count and a unit (minutes, hours, days, weeks, months, years). */
const ttl = z
	.string()
	.regex(/^\d{1,5}[mhdwMy]$/, "Use a TTL like 30m, 12h, 7d, 4w, 6M or 1y")
	.optional();

const tagKey = z
	.string()
	.regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/, "Tag keys use letters, numbers and hyphens");
const tagValue = z.string().regex(/^[\x20-\x7E]{0,1024}$/, "Tag values use printable ASCII characters");

/** Paths Kelp refuses to delete or move: the root, SeaweedFS system folders and bucket roots. */
export function isProtectedPath(path: string): boolean {
	return path === "/" || /^\/(buckets|topics|etc)$/.test(path) || /^\/buckets\/[^/]+$/.test(path);
}

/** Percent-encodes each segment so names with `#`, `?` or spaces reach the filer intact. */
export function encodePath(path: string): string {
	return path.split("/").map(encodeURIComponent).join("/");
}

/** Media types a browser can show inline without running code from Kelp's origin. */
const INLINE_SAFE = /^(image\/(png|jpe?g|gif|webp|avif|bmp)|video\/|audio\/|application\/pdf$)/;

function contentDisposition(kind: "inline" | "attachment", name: string): string {
	const ascii = name.replace(/[^\x20-\x7E]|["\\]/g, "_");
	return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

const PASS_THROUGH = [
	"content-type",
	"content-length",
	"content-range",
	"accept-ranges",
	"etag",
	"last-modified",
];

export function filesRoutes({ filer }: Services) {
	/** Requests the filer directly so long transfers are bounded by the client, not a timeout. */
	async function stream(path: string, init: RequestInit & { query?: Record<string, string> }) {
		const url = filer.url(encodePath(path));
		for (const [key, value] of Object.entries(init.query ?? {})) url.searchParams.set(key, value);
		let response: Response;
		try {
			response = await fetch(url, {
				...init,
				...(init.body instanceof ReadableStream ? { duplex: "half" } : {}),
			});
		} catch (error) {
			throw new UpstreamError("filer", 502, `filer is unreachable: ${(error as Error).message}`);
		}
		if (response.status === 404) throw new UpstreamError("filer", 404, `${path} does not exist`);
		if (!response.ok && response.status !== 304) {
			const text = (await response.text()).trim();
			throw new UpstreamError("filer", response.status, text || `filer returned ${response.status}`);
		}
		return response;
	}

	async function entry(path: string): Promise<Raw> {
		try {
			return await filer.json<Raw>(encodePath(path), { query: { metadata: "true" } });
		} catch (error) {
			if (error instanceof UpstreamError && error.status === 404) {
				throw new UpstreamError("filer", 404, `${path} does not exist`);
			}
			throw error;
		}
	}

	return new Hono<Env>()
		.get("/files/list", async (c) => {
			const path = filerPath.parse(c.req.query("path") ?? "/");
			const limit = z.coerce.number().int().min(1).max(1000).default(200).parse(c.req.query("limit"));
			const cursor = c.req.query("cursor");
			const dir = path === "/" ? "/" : `${encodePath(path)}/`;
			let raw: Raw;
			try {
				raw = await filer.json<Raw>(dir, {
					query: { limit, ...(cursor ? { lastFileName: cursor } : {}) },
					headers: { accept: "application/json" },
				});
			} catch (error) {
				if (error instanceof UpstreamError && error.status === 404) {
					throw new UpstreamError("filer", 404, `The folder ${path} does not exist`);
				}
				throw error;
			}
			const entries = list(raw.Entries).map(mapEntry);
			return c.json({
				path,
				entries,
				nextCursor:
					raw.ShouldDisplayLoadMore === true && entries.length > 0 ? str(raw.LastFileName) || null : null,
			});
		})
		.get("/files/entry", async (c) => {
			const path = filerPath.parse(c.req.query("path"));
			return c.json(mapDetails(await entry(path)));
		})
		.get("/files/content", async (c) => {
			const path = filerPath.parse(c.req.query("path"));
			const download = c.req.query("download") === "1";
			const headers: Record<string, string> = {};
			for (const name of ["range", "if-none-match", "if-modified-since"]) {
				const value = c.req.header(name);
				if (value) headers[name] = value;
			}
			const upstream = await stream(path, { headers, signal: c.req.raw.signal });
			const out = new Headers();
			for (const name of PASS_THROUGH) {
				const value = upstream.headers.get(name);
				if (value) out.set(name, value);
			}
			const type = out.get("content-type") ?? "application/octet-stream";
			const name = path.slice(path.lastIndexOf("/") + 1);
			const inline = !download && INLINE_SAFE.test(type);
			out.set("content-disposition", contentDisposition(download ? "attachment" : "inline", name));
			out.set("x-content-type-options", "nosniff");
			out.set("cache-control", "private, no-cache");
			// Anything a browser might execute is rendered in an opaque origin, away from the session.
			if (!inline)
				out.set("content-security-policy", "sandbox; default-src 'none'; style-src 'unsafe-inline'");
			return new Response(upstream.body, { status: upstream.status, headers: out });
		})
		.post("/files/upload", async (c) => {
			const dir = filerPath.parse(c.req.query("path"));
			const name = fileName.parse(c.req.query("name"));
			const fileTtl = ttl.parse(c.req.query("ttl") || undefined);
			const target = dir === "/" ? `/${name}` : `${dir}/${name}`;
			const response = await stream(target, {
				method: "PUT",
				body: c.req.raw.body ?? new Uint8Array(),
				headers: { "content-type": c.req.header("content-type") || "application/octet-stream" },
				signal: c.req.raw.signal,
				...(fileTtl ? { query: { ttl: fileTtl } } : {}),
			});
			const result = (await response.json().catch(() => ({}))) as Raw;
			return c.json({ path: target, size: num(result.size) }, 201);
		})
		.post("/files/folder", async (c) => {
			const input = z.object({ parent: filerPath, name: fileName }).parse(await c.req.json());
			const path = input.parent === "/" ? `/${input.name}` : `${input.parent}/${input.name}`;
			await filer.raw(`${encodePath(path)}/`, { method: "POST" });
			return c.json({ path }, 201);
		})
		.post("/files/move", async (c) => {
			const input = z.object({ from: filerPath, to: filerPath }).parse(await c.req.json());
			if (isProtectedPath(input.from)) {
				return c.json({ error: `${input.from} cannot be moved from here` }, 400);
			}
			if (input.to === input.from || input.to.startsWith(`${input.from}/`)) {
				return c.json({ error: "Choose a destination outside the item you are moving" }, 400);
			}
			await entry(input.from);
			await filer.raw(encodePath(input.to), { method: "POST", query: { "mv.from": input.from } });
			return c.json({ path: input.to });
		})
		.post("/files/delete", async (c) => {
			const input = z.object({ paths: z.array(filerPath).min(1).max(1000) }).parse(await c.req.json());
			const result: DeleteResult = { deleted: [], failed: [] };
			for (const path of input.paths) {
				if (isProtectedPath(path)) {
					const reason = path.startsWith("/buckets/")
						? "Delete buckets from the Buckets page"
						: "This folder belongs to SeaweedFS";
					result.failed.push({ path, error: reason });
					continue;
				}
				try {
					await filer.raw(encodePath(path), {
						method: "DELETE",
						query: { recursive: "true", ignoreRecursiveError: "false" },
					});
					result.deleted.push(path);
				} catch (error) {
					result.failed.push({ path, error: (error as Error).message });
				}
			}
			return c.json(result);
		})
		.put("/files/tags", async (c) => {
			const input = z.object({ path: filerPath, tags: z.record(tagKey, tagValue) }).parse(await c.req.json());
			const current = mapDetails(await entry(input.path));
			if (current.isDirectory) return c.json({ error: "Tags can only be set on files" }, 400);
			const target = encodePath(input.path);
			const existing = Object.keys(current.tags);
			if (existing.length > 0) {
				await filer.raw(target, { method: "DELETE", query: { tagging: existing.join(",") } });
			}
			const headers = Object.fromEntries(
				Object.entries(input.tags).map(([k, v]) => [`${TAG_PREFIX}${k}`, v]),
			);
			if (Object.keys(headers).length > 0)
				await filer.raw(target, { method: "PUT", query: { tagging: "" }, headers });
			return c.json(mapDetails(await entry(input.path)));
		});
}
