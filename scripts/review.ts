/**
 * A complete review environment in one command: a native SeaweedFS stack with a message broker,
 * a production build of Kelp, and the seeded sample data. Ctrl-C stops everything.
 *
 *   bun run review [--port 3000] [--offset 0]
 */
import { parseArgs } from "node:util";
import { kelpEnv, stackPorts, waitForHttp } from "./stack-lib.ts";

const { values } = parseArgs({
	options: {
		port: { type: "string", default: "3000" },
		offset: { type: "string", default: "0" },
	},
});
const ports = stackPorts(Number(values.offset));
const credentials = { admin: "review-admin", viewer: "review-viewer" };
const children: Array<ReturnType<typeof Bun.spawn>> = [];

function stop(code = 0): never {
	for (const child of children.reverse()) child.kill();
	process.exit(code);
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

async function run(cmd: string[], env: Record<string, string> = {}) {
	const proc = Bun.spawn(cmd, { env: { ...process.env, ...env }, stdout: "inherit", stderr: "inherit" });
	if ((await proc.exited) !== 0) {
		console.error(`[review] ${cmd.join(" ")} failed`);
		stop(1);
	}
}

console.log("[review] starting SeaweedFS (master, volume, filer, S3, admin, worker, broker)…");
const stack = Bun.spawn(
	["bun", "scripts/stack.ts", "--data", ".review", "--fresh", "--broker", "--offset", String(values.offset)],
	{ stdout: "pipe", stderr: "inherit" },
);
children.push(stack);
const reader = stack.stdout.getReader();
for (let buffered = ""; !buffered.includes("[stack] ready"); ) {
	const { value, done } = await reader.read();
	if (done) {
		console.error("[review] the SeaweedFS stack stopped during startup");
		stop(1);
	}
	buffered += new TextDecoder().decode(value);
}

console.log("[review] building Kelp…");
await run(["bun", "run", "build"]);

const env = {
	...kelpEnv(ports),
	PORT: String(values.port),
	KELP_ADMIN_USER: "admin",
	KELP_ADMIN_PASSWORD: credentials.admin,
	KELP_VIEWER_USER: "viewer",
	KELP_VIEWER_PASSWORD: credentials.viewer,
	KELP_SESSION_SECRET: crypto.randomUUID(),
};
const kelp = Bun.spawn(["bun", "server/main.ts"], {
	env: { ...process.env, ...env },
	stdout: "ignore",
	stderr: "inherit",
});
children.push(kelp);
const url = `http://127.0.0.1:${values.port}`;
if (!(await waitForHttp(`${url}/api/health`))) {
	console.error("[review] Kelp did not start");
	stop(1);
}

console.log("[review] seeding sample data…");
await run(["bun", "scripts/seed.ts", "--offset", String(values.offset), "--kelp", url], {
	KELP_ADMIN_PASSWORD: credentials.admin,
});

console.log(`
Kelp is ready at ${url}
  admin  / ${credentials.admin}   (full control)
  viewer / ${credentials.viewer}  (read-only)
S3 API: http://127.0.0.1:${ports.s3}  (kelp-dev-access-key / kelp-dev-secret-key)
Press Ctrl-C to stop.`);
await kelp.exited;
stop(0);
