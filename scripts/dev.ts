/**
 * Development: the Kelp API in watch mode plus Vite with hot reload, both pointed at the local
 * SeaweedFS stack (`bun run stack` in another terminal). Ctrl-C stops both.
 *
 *   bun run dev [--offset 0]
 */
import { parseArgs } from "node:util";
import { kelpEnv, stackPorts } from "./stack-lib.ts";

const { values } = parseArgs({ options: { offset: { type: "string", default: "0" } } });
const API_PORT = "3001";
const env = {
	...process.env,
	...kelpEnv(stackPorts(Number(values.offset))),
	PORT: API_PORT,
	KELP_PORT: API_PORT,
	KELP_ADMIN_PASSWORD: process.env.KELP_ADMIN_PASSWORD ?? "kelp",
	KELP_SESSION_SECRET: process.env.KELP_SESSION_SECRET ?? "kelp-development-only",
};

const children = [
	Bun.spawn(["bun", "--watch", "server/main.ts"], { env, stdout: "inherit", stderr: "inherit" }),
	Bun.spawn(["bunx", "vite"], { env, stdout: "inherit", stderr: "inherit" }),
];
console.log(`[dev] sign in at http://localhost:5173 as admin / ${env.KELP_ADMIN_PASSWORD}`);

function stop(code = 0) {
	for (const child of children) child.kill();
	process.exit(code);
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
const code = await Promise.race(children.map((child) => child.exited));
stop(code);
