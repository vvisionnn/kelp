import type { Hono } from "hono";
import type { Env } from "../app.ts";
import type { Services } from "../services.ts";
import { bucketsRoutes } from "./buckets.ts";
import { clusterRoutes } from "./cluster.ts";
import { filesRoutes } from "./files.ts";
import { iamRoutes } from "./iam.ts";
import { maintenanceRoutes } from "./maintenance.ts";
import { messagingRoutes } from "./messaging.ts";
import { settingsRoutes } from "./settings.ts";
import { storageRoutes } from "./storage.ts";
import { tablesRoutes } from "./tables.ts";

/** Every feature router, mounted under `/api`. Each area owns its own file. */
export function apiRoutes(services: Services): Array<[string, Hono<Env>]> {
	return [
		["/", clusterRoutes(services)],
		["/", storageRoutes(services)],
		["/", bucketsRoutes(services)],
		["/", filesRoutes(services)],
		["/", iamRoutes(services)],
		["/", maintenanceRoutes(services)],
		["/", messagingRoutes(services)],
		["/", tablesRoutes(services)],
		["/", settingsRoutes(services)],
	];
}
