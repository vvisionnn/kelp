import { defineConfig, devices } from "@playwright/test";
import { kelpEnv, stackPorts } from "./scripts/stack-lib.ts";

/**
 * End-to-end tests against a real SeaweedFS started from the native `weed` binary (no Docker).
 * The stack runs on shifted ports (KELP_E2E_OFFSET, KELP_E2E_PORT) so several can run side by side.
 */
const ports = stackPorts(Number(process.env.KELP_E2E_OFFSET ?? 100));
const KELP_PORT = Number(process.env.KELP_E2E_PORT ?? 3100);
export const E2E_ADMIN = { username: "admin", password: "e2e-admin-password" };
export const E2E_VIEWER = { username: "viewer", password: "e2e-viewer-password" };

export default defineConfig({
	testDir: "e2e",
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: 0,
	workers: process.env.CI ? 2 : 4,
	timeout: 30_000,
	expect: { timeout: 10_000 },
	reporter: process.env.CI ? [["github"], ["list"], ["html", { open: "never" }]] : "list",
	use: {
		baseURL: `http://127.0.0.1:${KELP_PORT}`,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	projects: [
		{ name: "setup", testMatch: /auth\.setup\.ts/ },
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"], storageState: ".tmp/e2e/admin.json" },
			dependencies: ["setup"],
		},
	],
	webServer: [
		{
			command: `bun scripts/stack.ts --data .tmp/e2e/stack --fresh --offset ${ports.master - 9333}`,
			url: `http://127.0.0.1:${ports.admin}/health`,
			timeout: 120_000,
			reuseExistingServer: !process.env.CI,
			stdout: "pipe",
		},
		{
			command: "bun run build && bun server/main.ts",
			url: `http://127.0.0.1:${KELP_PORT}/api/health`,
			timeout: 120_000,
			reuseExistingServer: !process.env.CI,
			env: {
				...kelpEnv(ports),
				PORT: String(KELP_PORT),
				KELP_ADMIN_USER: E2E_ADMIN.username,
				KELP_ADMIN_PASSWORD: E2E_ADMIN.password,
				KELP_VIEWER_USER: E2E_VIEWER.username,
				KELP_VIEWER_PASSWORD: E2E_VIEWER.password,
				KELP_SESSION_SECRET: "e2e-session-secret",
			},
		},
	],
});
