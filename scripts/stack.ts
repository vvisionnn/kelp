/**
 * Runs a real single-node SeaweedFS (master + volume + filer + S3), the native admin API and a
 * maintenance worker from the `weed` binary that mise installs. Used for local development, the
 * review environment and CI end-to-end tests. Ctrl-C stops everything.
 *
 *   bun run stack [--data .stack] [--fresh] [--offset 0]
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { SeaweedGrpc } from "../server/upstream/grpc.ts";
import { S3_CREDENTIALS, stackPorts, waitFor, waitForHttp } from "./stack-lib.ts";

const { values } = parseArgs({
	options: {
		data: { type: "string", default: ".stack" },
		fresh: { type: "boolean", default: false },
		offset: { type: "string", default: "0" },
	},
});
const PORTS = stackPorts(Number(values.offset));
const dataDir = resolve(values.data ?? ".stack");
const weed = process.env.WEED_BIN || Bun.which("weed");
if (!weed) {
	console.error("weed binary not found. Run `mise install` first.");
	process.exit(1);
}

if (values.fresh) await rm(dataDir, { recursive: true, force: true });
for (const dir of ["data", "admin", "worker"]) await mkdir(join(dataDir, dir), { recursive: true });
await writeFile(
	join(dataDir, "s3.json"),
	JSON.stringify({
		identities: [
			{
				name: "kelp-dev",
				credentials: [S3_CREDENTIALS],
				actions: ["Admin", "Read", "List", "Tagging", "Write"],
			},
		],
	}),
);

const children: Array<ReturnType<typeof Bun.spawn>> = [];
let stopping = false;

function stop(code = 0): never {
	stopping = true;
	for (const child of children) child.kill();
	process.exit(code);
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

function start(name: string, args: string[]) {
	const child = Bun.spawn([weed as string, ...args], { stdout: "ignore", stderr: "ignore" });
	child.exited.then((code) => {
		if (!stopping) {
			console.error(`[stack] ${name} exited with code ${code}`);
			stop(1);
		}
	});
	children.push(child);
}

async function ready(name: string, url: string) {
	if (!(await waitForHttp(url))) {
		console.error(`[stack] ${name} did not become ready at ${url}`);
		stop(1);
	}
}

start("server", [
	"server",
	`-dir=${join(dataDir, "data")}`,
	"-ip=127.0.0.1",
	`-master.port=${PORTS.master}`,
	`-volume.port=${PORTS.volume}`,
	"-filer",
	`-filer.port=${PORTS.filer}`,
	"-s3",
	`-s3.port=${PORTS.s3}`,
	`-s3.port.iceberg=${PORTS.iceberg}`,
	`-s3.config=${join(dataDir, "s3.json")}`,
	"-volume.max=0",
	"-master.volumeSizeLimitMB=256",
]);
await ready("filer", `http://127.0.0.1:${PORTS.filer}/`);
await ready("s3", `http://127.0.0.1:${PORTS.s3}/`);

// The filer joins the cluster a few seconds after its HTTP port opens; wait until the master lists it.
const grpc = new SeaweedGrpc(`127.0.0.1:${PORTS.master + 10000}`);
const filerJoined = await waitFor(async () => (await grpc.listClusterNodes("filer")).length > 0);
grpc.close();
if (!filerJoined) {
	console.error("[stack] the filer never registered with the master");
	stop(1);
}

start("admin", [
	"admin",
	`-port=${PORTS.admin}`,
	`-master=127.0.0.1:${PORTS.master}`,
	`-dataDir=${join(dataDir, "admin")}`,
]);
await ready("admin", `http://127.0.0.1:${PORTS.admin}/health`);

start("worker", [
	"worker",
	`-admin=127.0.0.1:${PORTS.admin}`,
	"-jobType=all",
	`-workingDir=${join(dataDir, "worker")}`,
]);

console.log(
	`[stack] ready: master :${PORTS.master}, filer :${PORTS.filer}, s3 :${PORTS.s3}, admin :${PORTS.admin} (data in ${dataDir})`,
);
