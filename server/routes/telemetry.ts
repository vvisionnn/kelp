import { Hono } from "hono";
import type { TelemetryRange } from "../../shared/telemetry.ts";
import type { Env } from "../app.ts";
import type { Services } from "../services.ts";

const RANGES: TelemetryRange[] = ["15m", "1h", "6h", "24h"];

export function telemetryRoutes({ telemetry }: Services) {
	return new Hono<Env>().get("/telemetry", (c) => {
		const range = (c.req.query("range") ?? "1h") as TelemetryRange;
		if (!RANGES.includes(range)) return c.json({ error: `range must be one of ${RANGES.join(", ")}` }, 400);
		return c.json(telemetry.snapshot(range));
	});
}
