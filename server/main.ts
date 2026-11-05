import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { apiRoutes } from "./routes/index.ts";
import { createServices } from "./services.ts";

const { config, warnings } = loadConfig(process.env);
for (const warning of warnings) console.warn(`[kelp] ${warning}`);

const services = createServices(config);
const app = createApp({ config, routes: apiRoutes(services) });
services.telemetry.start();
if (!services.telemetry.enabled) console.log("[kelp] KELP_METRICS_URLS is not set; live charts are off.");

const server = Bun.serve({
	port: config.port,
	hostname: "0.0.0.0",
	fetch: app.fetch,
	// Uploads stream straight through to the filer.
	maxRequestBodySize: 64 * 1024 ** 3,
	idleTimeout: 255,
});
console.log(`[kelp] listening on http://localhost:${server.port}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => {
		services.telemetry.stop();
		services.grpc.close();
		server.stop();
		process.exit(0);
	});
}
