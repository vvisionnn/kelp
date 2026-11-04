import type { Hono } from "hono";
import type { Env } from "../app.ts";
import type { Services } from "../services.ts";
import { clusterRoutes } from "./cluster.ts";

/** Every feature router, mounted under `/api`. */
export function apiRoutes(services: Services): Array<[string, Hono<Env>]> {
	return [["/", clusterRoutes(services)]];
}
