/**
 * Boots docker-compose.yml with throwaway secrets and checks the whole stack from the outside:
 * Kelp sign-in, every SeaweedFS component reachable through Kelp, a registered maintenance worker,
 * and S3 reads/writes with the bootstrap key. Tears everything down afterwards.
 *
 *   bun scripts/compose-smoke.ts [--keep]
 */

import { parseArgs } from "node:util";
import { S3Client } from "bun";
import { waitFor } from "./stack-lib.ts";

const { values } = parseArgs({ options: { keep: { type: "boolean", default: false } } });
const project = "kelp-smoke";
const env = {
	KELP_ADMIN_PASSWORD: "smoke-admin-password",
	KELP_SESSION_SECRET: "smoke-session-secret",
	S3_ACCESS_KEY: "smoke-access-key",
	S3_SECRET_KEY: "smoke-secret-key",
	SEAWEEDFS_WORKER_KEY: "smoke-worker-key",
	KELP_VERSION: process.env.KELP_VERSION ?? "smoke",
	KELP_PORT: "3990",
	S3_PORT: "8990",
};
const kelp = `http://127.0.0.1:${env.KELP_PORT}`;

async function compose(...args: string[]) {
	const proc = Bun.spawn(["docker", "compose", "-p", project, ...args], {
		env: { ...process.env, ...env },
		stdout: "inherit",
		stderr: "inherit",
	});
	if ((await proc.exited) !== 0) throw new Error(`docker compose ${args.join(" ")} failed`);
}

function check(name: string, ok: boolean, detail = "") {
	console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
	if (!ok) failures++;
}

let failures = 0;
try {
	if (!process.env.KELP_VERSION) await compose("build", "kelp");
	await compose("up", "-d", "--wait", "--wait-timeout", "180");

	const login = await fetch(`${kelp}/api/auth/login`, {
		method: "POST",
		headers: { "content-type": "application/json", "x-kelp-csrf": "1" },
		body: JSON.stringify({ username: "admin", password: env.KELP_ADMIN_PASSWORD }),
	});
	check("sign in", login.ok, String(login.status));
	const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
	const get = async (path: string) => {
		const response = await fetch(`${kelp}/api${path}`, { headers: { cookie } });
		return { ok: response.ok, body: (await response.json()) as Record<string, unknown> };
	};

	for (const path of [
		"/overview",
		"/cluster/masters",
		"/cluster/volume-servers",
		"/cluster/filers",
		"/system/config",
	]) {
		const { ok } = await get(path);
		check(`GET ${path}`, ok);
	}
	const workerJoined = await waitFor(async () => {
		const { body } = await get("/overview");
		return ((body.maintenance as { workers?: number } | undefined)?.workers ?? 0) > 0;
	});
	check("maintenance worker registered", workerJoined);

	const s3 = new S3Client({
		accessKeyId: env.S3_ACCESS_KEY,
		secretAccessKey: env.S3_SECRET_KEY,
		endpoint: `http://127.0.0.1:${env.S3_PORT}`,
		bucket: "smoke",
	});
	await s3.write("hello.txt", "hello from kelp");
	check("S3 write and read", (await s3.file("hello.txt").text()) === "hello from kelp");

	// Ask Docker, not the network: another local process may legitimately use the same host port.
	const ports = Bun.spawnSync(
		["docker", "compose", "-p", project, "ps", "admin", "--format", "{{.Publishers}}"],
		{
			env: { ...process.env, ...env },
		},
	);
	const published = ports.stdout.toString().match(/"PublishedPort":\s*[1-9]/);
	check("native admin is not published", ports.exitCode === 0 && !published);
} finally {
	if (!values.keep) await compose("down", "-v");
}

if (failures > 0) {
	console.error(`${failures} check(s) failed`);
	process.exit(1);
}
console.log("compose stack is healthy");
