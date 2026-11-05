import { stackPorts } from "../scripts/stack-lib.ts";
import { expect, test, unique } from "./fixtures.ts";

const ports = stackPorts(Number(process.env.KELP_E2E_OFFSET ?? 100));
const filer = `http://127.0.0.1:${ports.filer}`;
/** Job types only appear after the worker registers with the admin server. */
const WORKER_READY = { timeout: 45_000 };

test("overview lists every job type the worker offers", async ({ page }) => {
	await page.goto("/maintenance");
	for (const name of ["Volume vacuum", "EC encoding", "Volume balance", "S3 lifecycle"]) {
		await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible(WORKER_READY);
	}
	await expect(page.getByText("Detection slots")).toBeVisible();
	await expect(page.getByText("Activity", { exact: true })).toBeVisible();
});

test("settings validate before they can be saved", async ({ page }) => {
	await page.goto("/maintenance/ec_balance");
	await expect(page.getByRole("heading", { name: "EC shard balance" })).toBeVisible(WORKER_READY);
	const interval = page.getByLabel("Detection interval");
	await interval.fill("0");
	await expect(page.getByText("Detection interval must be a whole number of at least 1")).toBeVisible();
	await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
	await page.getByRole("button", { name: "Discard" }).click();
	await expect(page.getByRole("region", { name: "Unsaved changes" })).toBeHidden();
});

test("vacuum end to end: tune, detect, run, inspect the job", async ({ page }) => {
	test.setTimeout(120_000);
	await page.goto("/maintenance/vacuum");
	await expect(page.getByRole("heading", { name: "Volume vacuum" })).toBeVisible(WORKER_READY);

	// Make any garbage count, and save through the form.
	await page.getByLabel("Garbage threshold").fill("0.0001");
	await page.getByRole("button", { name: "Save changes" }).click();
	await expect(page.getByText("Volume vacuum settings saved")).toBeVisible();
	await page.reload();
	await expect(page.getByLabel("Garbage threshold")).toHaveValue("0.0001");

	// Write and delete files so a volume holds garbage.
	const folder = unique("garbage");
	const body = new Uint8Array(64 * 1024).fill(7);
	for (let i = 0; i < 5; i++) {
		const form = new FormData();
		form.append("file", new Blob([body]), `f${i}.bin`);
		expect((await fetch(`${filer}/${folder}/f${i}.bin`, { method: "POST", body: form })).ok).toBe(true);
	}
	expect((await fetch(`${filer}/${folder}/?recursive=true`, { method: "DELETE" })).ok).toBe(true);

	// Volume servers report garbage on their next heartbeat; wait for the detector to see it.
	await expect
		.poll(
			async () => {
				const response = await page.request.post("/api/maintenance/job-types/vacuum/detect", {
					headers: { "x-kelp-csrf": "1" },
				});
				return (await response.json()).totalProposals;
			},
			{ timeout: 60_000, intervals: [1000] },
		)
		.toBeGreaterThan(0);

	await page.getByRole("button", { name: "Check for work" }).click();
	const sheet = page.getByRole("dialog");
	await expect(sheet.getByText("Proposed jobs")).toBeVisible();
	await sheet.getByRole("button", { name: "Run these jobs" }).click();
	await expect(page.getByText(/Volume vacuum ran \d+ jobs?: \d+ succeeded, 0 failed/)).toBeVisible({
		timeout: 60_000,
	});

	await page.getByRole("tab", { name: "Jobs" }).click();
	await page
		.getByRole("link", { name: /Vacuum volume/ })
		.first()
		.click();
	await expect(page.getByText("Succeeded").first()).toBeVisible();
	await expect(page.getByText("Timeline")).toBeVisible();
	await expect(page.getByText("Job queued for execution").first()).toBeVisible();

	await page.getByRole("link", { name: "Vacuum", exact: true }).click();
	await page.getByRole("tab", { name: "Run history" }).click();
	await expect(page.getByText(/vacuum completed for volume/).first()).toBeVisible();
});

test("jobs page filters through the URL", async ({ page }) => {
	await page.goto("/maintenance/jobs");
	await expect(page.getByRole("heading", { name: "Maintenance jobs" })).toBeVisible();
	await page.getByRole("radio", { name: /^Failed/ }).click();
	await expect(page).toHaveURL(/state=failed/);
	await page.getByRole("radio", { name: /^All/ }).click();
	await expect(page).not.toHaveURL(/state=/);
});

test("viewers read settings but cannot run or change anything", async ({ viewerPage }) => {
	await viewerPage.goto("/maintenance/vacuum");
	await expect(viewerPage.getByText(/You have read-only access/)).toBeVisible(WORKER_READY);
	await expect(viewerPage.getByRole("button", { name: "Run now" })).toHaveCount(0);
	await expect(viewerPage.getByLabel("Garbage threshold")).toBeDisabled();
	const response = await viewerPage.request.post("/api/maintenance/job-types/vacuum/run", {
		headers: { "x-kelp-csrf": "1" },
	});
	expect(response.status()).toBe(403);
});
