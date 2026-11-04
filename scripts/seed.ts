/**
 * Fills a SeaweedFS cluster with a realistic studio's data through Kelp's own API (plus S3 for
 * object data): buckets with quotas, versioning, object lock, lifecycle rules and policies; IAM
 * users, keys, groups, policies and service accounts; storage activity (grown and frozen volumes,
 * an erasure-coded volume, vacuum history). Safe to re-run.
 *
 *   bun run seed                          # local stack (bun run stack) + Kelp on :3000
 *   bun run seed --kelp http://host:3000 --user admin --password … --s3 http://host:8333 \
 *     --access-key … --secret-key … --shell "docker compose exec -T seaweedfs weed shell"
 */

import { parseArgs } from "node:util";
import { S3Client } from "bun";
import { KelpClient } from "./seed/kelp-client.ts";
import { SEED_BUCKETS, seedObjects } from "./seed/objects.ts";
import { S3_CREDENTIALS, stackPorts } from "./stack-lib.ts";

const { values } = parseArgs({
	options: {
		kelp: { type: "string", default: process.env.KELP_URL ?? "http://127.0.0.1:3000" },
		user: { type: "string", default: process.env.KELP_ADMIN_USER ?? "admin" },
		password: { type: "string", default: process.env.KELP_ADMIN_PASSWORD ?? "" },
		s3: { type: "string", default: `http://127.0.0.1:${stackPorts().s3}` },
		"access-key": { type: "string", default: S3_CREDENTIALS.accessKey },
		"secret-key": { type: "string", default: S3_CREDENTIALS.secretKey },
		// How to open `weed shell` against the cluster (for the one-off erasure coding step).
		shell: { type: "string", default: `weed shell -master=127.0.0.1:${stackPorts().master}` },
	},
});

const kelp = new KelpClient(values.kelp as string);
const step = (title: string) => console.log(`\n• ${title}`);
const done = (detail: string) => console.log(`  ${detail}`);

await kelp.signIn(values.user as string, values.password as string);

// ---------------------------------------------------------------- IAM
step("Access: policies, users, groups, service accounts");
const statement = (actions: string[], resources: string[]) => ({
	Effect: "Allow",
	Action: actions,
	Resource: resources,
});
const policies = {
	"media-read-write": [
		statement(
			["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"],
			[
				"arn:aws:s3:::media-assets",
				"arn:aws:s3:::media-assets/*",
				"arn:aws:s3:::photo-library",
				"arn:aws:s3:::photo-library/*",
			],
		),
	],
	"analytics-read-only": [
		statement(
			["s3:GetObject", "s3:ListBucket"],
			[
				"arn:aws:s3:::analytics",
				"arn:aws:s3:::analytics/*",
				"arn:aws:s3:::web-logs",
				"arn:aws:s3:::web-logs/*",
			],
		),
	],
	"ci-artifacts-writer": [
		statement(
			["s3:GetObject", "s3:PutObject", "s3:ListBucket", "s3:DeleteObject"],
			["arn:aws:s3:::ci-artifacts", "arn:aws:s3:::ci-artifacts/*"],
		),
	],
	"backup-operator": [
		statement(
			["s3:PutObject", "s3:GetObject", "s3:ListBucket"],
			["arn:aws:s3:::backups", "arn:aws:s3:::backups/*"],
		),
	],
};
for (const [name, Statement] of Object.entries(policies)) {
	await kelp.ensure(() =>
		kelp.post("/iam/policies", { name, document: { Version: "2012-10-17", Statement } }),
	);
}
const users = [
	{ username: "maya.chen", email: "maya@tidewater.studio", policies: ["media-read-write"] },
	{ username: "omar.haddad", email: "omar@tidewater.studio", policies: ["analytics-read-only"] },
	{
		username: "lena.park",
		email: "lena@tidewater.studio",
		policies: ["media-read-write", "analytics-read-only"],
	},
	{ username: "github-actions", email: "", policies: ["ci-artifacts-writer"] },
	{ username: "nightly-backup", email: "", policies: ["backup-operator"] },
];
for (const user of users) {
	await kelp.ensure(() => kelp.post("/iam/users", { ...user, generateKey: true }));
}
const groups = {
	designers: ["maya.chen", "lena.park"],
	data: ["omar.haddad", "lena.park"],
	automation: ["github-actions", "nightly-backup"],
};
const groupPolicies: Record<string, string> = {
	designers: "media-read-write",
	data: "analytics-read-only",
	automation: "ci-artifacts-writer",
};
for (const [group, members] of Object.entries(groups)) {
	await kelp.ensure(() => kelp.post("/iam/groups", { name: group }));
	for (const username of members)
		await kelp.ensure(() => kelp.post(`/iam/groups/${group}/members`, { username }));
	await kelp.ensure(() => kelp.post(`/iam/groups/${group}/policies`, { policy: groupPolicies[group] }));
}
const accounts = await kelp.get<{ serviceAccounts: Array<{ description: string }> }>("/iam/service-accounts");
const haveAccount = (description: string) =>
	accounts.serviceAccounts.some((a) => a.description === description);
const inNinetyDays = new Date(Date.now() + 90 * 86_400_000).toISOString();
if (!haveAccount("Deploy previews uploader")) {
	await kelp.post("/iam/service-accounts", {
		parentUser: "github-actions",
		description: "Deploy previews uploader",
		expiresAt: inNinetyDays,
	});
}
if (!haveAccount("Grafana dashboards")) {
	await kelp.post("/iam/service-accounts", { parentUser: "omar.haddad", description: "Grafana dashboards" });
}
done(
	`${Object.keys(policies).length} policies, ${users.length} users, ${Object.keys(groups).length} groups, 2 service accounts`,
);

// ---------------------------------------------------------------- buckets
step("Buckets with quotas, versioning, object lock, lifecycle and policies");
const GiB = 1024 ** 3;
const bucketOptions: Record<string, object> = {
	"media-assets": { owner: "maya.chen", quotaBytes: 50 * GiB, versioning: true },
	"photo-library": { owner: "lena.park", quotaBytes: 200 * GiB },
	"web-logs": { owner: "omar.haddad" },
	analytics: { owner: "omar.haddad", quotaBytes: 20 * GiB },
	backups: {
		owner: "nightly-backup",
		versioning: true,
		objectLock: { mode: "GOVERNANCE", retentionDays: 30 },
	},
	"ci-artifacts": { owner: "github-actions", quotaBytes: 10 * GiB },
};
for (const name of SEED_BUCKETS) {
	await kelp.ensure(() => kelp.post("/buckets", { name, ...bucketOptions[name] }));
}
const rule = (id: string, extra: object) => ({
	id,
	enabled: true,
	prefix: "",
	tags: {},
	sizeGreaterThan: null,
	sizeLessThan: null,
	expirationDays: null,
	expirationDate: null,
	expiredDeleteMarkers: false,
	noncurrentExpirationDays: null,
	newerNoncurrentVersions: null,
	abortMultipartDays: null,
	...extra,
});
await kelp.put("/buckets/web-logs/lifecycle", {
	rules: [
		rule("expire-old-logs", { prefix: "access/", expirationDays: 90 }),
		rule("clean-uploads", { abortMultipartDays: 7 }),
	],
});
await kelp.put("/buckets/ci-artifacts/lifecycle", {
	rules: [rule("artifact-retention", { expirationDays: 30 })],
});
await kelp.put("/buckets/media-assets/lifecycle", {
	rules: [rule("old-versions", { noncurrentExpirationDays: 60 })],
});
await kelp.put("/buckets/media-assets/policy", {
	policy: {
		Version: "2012-10-17",
		Statement: [
			{
				Sid: "PublicBrand",
				Effect: "Allow",
				Principal: "*",
				Action: ["s3:GetObject"],
				Resource: ["arn:aws:s3:::media-assets/brand/*"],
			},
		],
	},
});
done(`${SEED_BUCKETS.length} buckets, 4 lifecycle rules, 1 public-read policy`);

// ---------------------------------------------------------------- objects
step("Objects over S3");
const s3 = new S3Client({
	accessKeyId: values["access-key"] as string,
	secretAccessKey: values["secret-key"] as string,
	endpoint: values.s3 as string,
});
const objects = seedObjects();
let uploaded = 0;
let bytes = 0;
const queue = [...objects];
await Promise.all(
	Array.from({ length: 8 }, async () => {
		for (let object = queue.shift(); object; object = queue.shift()) {
			const file = s3.file(object.key, { bucket: object.bucket, type: object.type });
			if (await file.exists()) continue;
			const body = object.body();
			await file.write(body);
			uploaded++;
			bytes += typeof body === "string" ? body.length : body.byteLength;
		}
	}),
);
done(`${uploaded} new objects (${(bytes / 1024 / 1024).toFixed(1)} MiB), ${objects.length} total`);

// ---------------------------------------------------------------- storage
step("Storage: extra collections, a frozen volume, an erasure-coded volume, vacuum history");
type Inventory = {
	volumes: Array<{ id: number; collection: string; readOnly: boolean; replicas: Array<{ server: string }> }>;
	ecVolumes: unknown[];
};
let inventory = await kelp.get<Inventory>("/storage");
if (!inventory.volumes.some((v) => v.collection === "scratch")) {
	await kelp.post("/storage/grow", { collection: "scratch", count: 2, replication: "000" });
	inventory = await kelp.get<Inventory>("/storage");
}
const scratch = inventory.volumes.find((v) => v.collection === "scratch");
const replica = scratch?.replicas[0];
if (scratch && replica && !scratch.readOnly) {
	await kelp.post(`/storage/volumes/${scratch.id}/read-only`, { server: replica.server, readOnly: true });
}

if (inventory.ecVolumes.length === 0) {
	// The maintenance planner needs several servers to spread shards; a single-node demo cluster
	// encodes one backups volume directly through `weed shell` instead.
	const target = inventory.volumes.filter((v) => v.collection === "backups").sort((a, b) => b.id - a.id)[0];
	if (target) {
		const shell = (values.shell as string).split(" ").filter(Boolean);
		const proc = Bun.spawn(shell, { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
		proc.stdin.write(`lock\nec.encode -volumeId=${target.id} -force\nunlock\n`);
		await proc.stdin.end();
		const code = await proc.exited;
		done(
			code === 0
				? `erasure coded backups volume ${target.id}`
				: `ec.encode failed: ${await new Response(proc.stderr).text()}`,
		);
	}
}
await kelp.post("/maintenance/job-types/vacuum/run").catch(() => undefined);
done("collections, read-only volume, EC and vacuum run ready");

console.log(`\nSeeded. Open ${values.kelp} and sign in as ${values.user}.`);
