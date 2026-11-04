import { Hono } from "hono";
import type { Env } from "../app.ts";
import type { Services } from "../services.ts";

export function tablesRoutes(_services: Services) {
	return new Hono<Env>();
}
