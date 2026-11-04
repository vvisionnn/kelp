import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../app.ts";
import { mapInventory } from "../map/storage.ts";
import type { Services } from "../services.ts";
import { HttpUpstream, UpstreamError } from "../upstream/http.ts";

const volumeId = z.coerce.number().int().positive();
const replica = z.object({ server: z.string().min(1) });
const readOnly = replica.extend({ readOnly: z.boolean() });
const vacuum = z.object({ garbageThreshold: z.number().min(0).max(1) });
const grow = z.object({
	count: z.number().int().min(1).max(100),
	collection: z.string().optional(),
	replication: z
		.string()
		.regex(/^\d{3}$/, "Replication is three digits, like 001")
		.optional(),
	ttl: z
		.string()
		.regex(/^(\d+[mhdwMy])?$/, "TTL is a number and a unit, like 3d")
		.optional(),
	dataCenter: z.string().optional(),
	rack: z.string().optional(),
	dataNode: z.string().optional(),
	diskType: z.string().optional(),
});

/** Re-labels a SeaweedFS error, keeping its message readable on one line. */
function relabel(error: unknown, status: number, message: (upstream: string) => string): never {
	if (error instanceof UpstreamError && error.status < 500) {
		throw new UpstreamError(error.upstream, status, message(error.message.replace(/\s*\n\s*/g, " ").trim()));
	}
	throw error;
}

export function storageRoutes({ admin, master, config }: Services) {
	// Vacuuming every volume can take far longer than an ordinary request.
	const slowMaster = new HttpUpstream("master", config.masterUrl, { timeoutMs: 30 * 60_000 });
	const replicaPath = (id: number, server: string, action: string) =>
		`volumes/${id}/${encodeURIComponent(server).replaceAll("%3A", ":")}/${action}`;

	return new Hono<Env>()
		.get("/storage", async (c) => c.json(mapInventory(await admin.json("volumes/export"))))
		.post("/storage/volumes/:id/vacuum", async (c) => {
			const id = volumeId.parse(c.req.param("id"));
			const { server } = replica.parse(await c.req.json());
			await admin.json(replicaPath(id, server, "vacuum"), { method: "POST" });
			return c.json({ ok: true });
		})
		.post("/storage/volumes/:id/read-only", async (c) => {
			const id = volumeId.parse(c.req.param("id"));
			const body = readOnly.parse(await c.req.json());
			await admin.json(replicaPath(id, body.server, "read-only"), {
				method: "POST",
				body: { read_only: body.readOnly },
			});
			return c.json({ ok: true });
		})
		.post("/storage/vacuum", async (c) => {
			const { garbageThreshold } = vacuum.parse(await c.req.json());
			await slowMaster.raw("vol/vacuum", { method: "POST", query: { garbageThreshold } });
			return c.json({ ok: true });
		})
		.post("/storage/grow", async (c) => {
			const input = grow.parse(await c.req.json());
			const query: Record<string, string | number> = { count: input.count };
			for (const [key, param] of [
				["collection", "collection"],
				["replication", "replication"],
				["ttl", "ttl"],
				["dataCenter", "dataCenter"],
				["rack", "rack"],
				["dataNode", "dataNode"],
				["diskType", "disk"],
			] as const) {
				const value = input[key]?.trim();
				if (value) query[param] = value;
			}
			try {
				const result = await master.json<{ count?: number }>("vol/grow", { method: "POST", query });
				return c.json({ count: result?.count ?? input.count });
			} catch (error) {
				relabel(error, 409, (message) => `SeaweedFS could not place the new volumes: ${message}`);
			}
		})
		.delete("/storage/collections/:name", async (c) => {
			const name = c.req.param("name");
			try {
				await master.raw("col/delete", { method: "POST", query: { collection: name } });
			} catch (error) {
				relabel(error, 404, () => `Collection "${name}" does not exist.`);
			}
			return c.json({ ok: true });
		});
}
