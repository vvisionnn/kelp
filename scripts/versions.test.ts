import { expect, test } from "bun:test";

const root = `${import.meta.dir}/..`;

test("docker compose runs the same SeaweedFS version that CI tests against", async () => {
	const mise = await Bun.file(`${root}/mise.toml`).text();
	const compose = await Bun.file(`${root}/docker-compose.yml`).text();
	const env = await Bun.file(`${root}/.env.example`).text();
	const tested = mise.match(/"github:seaweedfs\/seaweedfs" = \{ version = "([^"]+)"/)?.[1];
	expect(tested).toBeTruthy();
	expect(compose).toContain(`chrislusf/seaweedfs:\${SEAWEEDFS_VERSION:-${tested}}`);
	expect(env).toContain(`SEAWEEDFS_VERSION=${tested}`);
});

test("the Docker image uses the Bun version the project pins", async () => {
	const pkg = await Bun.file(`${root}/package.json`).json();
	const dockerfile = await Bun.file(`${root}/Dockerfile`).text();
	expect(dockerfile).toContain(`ARG BUN_VERSION=${String(pkg.packageManager).replace("bun@", "")}`);
});
