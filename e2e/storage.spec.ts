import { execFileSync } from "node:child_process";
import { stackPorts } from "../scripts/stack-lib.ts";
import { expect, test, unique } from "./fixtures.ts";

const ports = stackPorts(Number(process.env.KELP_E2E_OFFSET ?? 100));
const master = `http://127.0.0.1:${ports.master}`;

/** Writes one small file into `collection` straight through the master and a volume server. */
async function writeFile(collection: string): Promise<number> {
	const assign = (await (await fetch(`${master}/dir/assign?collection=${collection}`)).json()) as {
		fid: string;
		url: string;
	};
	const form = new FormData();
	form.append("file", new Blob([`kelp e2e ${collection} ${"x".repeat(4096)}`]), "e2e.txt");
	const upload = await fetch(`http://${assign.url}/${assign.fid}`, { method: "POST", body: form });
	expect(upload.ok).toBe(true);
	return Number(assign.fid.split(",")[0]);
}

function weedShell(commands: string) {
	execFileSync(process.env.WEED_BIN || "weed", ["shell", `-master=127.0.0.1:${ports.master}`], {
		input: `lock\n${commands}\nunlock\n`,
		timeout: 60_000,
	});
}

test("grow volumes into a new collection, freeze one, and delete the collection", async ({ page }) => {
	const collection = unique("e2e-grow");
	await page.goto("/volumes");
	await page.getByRole("button", { name: "Grow volumes" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel("Volumes").fill("2");
	await dialog.getByLabel("Collection").fill(collection);
	await dialog.getByRole("button", { name: "Grow volumes" }).click();
	await expect(page.getByText("2 volumes added")).toBeVisible();

	await page.goto(`/collections/${collection}`);
	await expect(page.getByRole("heading", { name: collection })).toBeVisible();
	const rows = page.getByRole("table").getByRole("row");
	await expect(rows).toHaveCount(3);
	const firstId = (await rows.nth(1).getByRole("link").textContent()) ?? "";

	await page.getByRole("button", { name: `Actions for volume ${firstId}` }).click();
	await page.getByRole("menuitem", { name: "Make read-only" }).click();
	await expect(page.getByText(`Volume ${firstId} is now read-only`)).toBeVisible();
	await expect(rows.nth(1).getByText("Read-only")).toBeVisible();

	await rows.nth(1).getByRole("link").click();
	await expect(page.getByRole("heading", { name: `Volume ${firstId}` })).toBeVisible();
	await page.getByRole("button", { name: "Make writable" }).click();
	await expect(page.getByText(`Volume ${firstId} is now writable`)).toBeVisible();
	await page.getByRole("button", { name: "Vacuum volume" }).click();
	await expect(page.getByText(`Volume ${firstId} vacuumed`)).toBeVisible();

	await page.getByRole("link", { name: collection }).click();
	await page.getByRole("button", { name: "Delete collection" }).click();
	const confirm = page.getByRole("alertdialog");
	await confirm.getByLabel(`Type ${collection} to confirm`).fill(collection);
	await confirm.getByRole("button", { name: "Delete collection" }).click();
	await expect(page.getByText(`Collection ${collection} deleted`)).toBeVisible();
	await expect(page).toHaveURL(/\/collections$/);
	await expect(page.getByRole("link", { name: collection })).toHaveCount(0);
});

test("erasure-coded volumes show their shard map", async ({ page }) => {
	const collection = unique("e2e-ec");
	const volumeId = await writeFile(collection);
	weedShell(`ec.encode -volumeId=${volumeId} -force`);

	await page.goto("/erasure-coding");
	await page.getByLabel("Search EC volumes").fill(collection);
	await page.getByRole("link", { name: String(volumeId), exact: true }).click();
	await expect(page.getByRole("heading", { name: `Volume ${volumeId}` })).toBeVisible();
	await expect(page.getByText("Complete")).toBeVisible();
	await expect(page.getByRole("img", { name: /^Shard 13: 127\.0\.0\.1:\d+$/ })).toBeVisible();

	// The plain volume is gone; its page points here.
	await page.goto(`/volumes/${volumeId}`);
	await expect(page.getByText(`Volume ${volumeId} is erasure coded`)).toBeVisible();
});

test("vacuum cluster previews and runs", async ({ page }) => {
	await page.goto("/volumes");
	await page.getByRole("button", { name: "Vacuum cluster" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByRole("button", { name: "1%", exact: true }).click();
	await dialog.getByRole("button", { name: "Vacuum cluster" }).click();
	await expect(page.getByText("Cluster vacuumed")).toBeVisible();
});

test("viewers browse storage without write controls", async ({ viewerPage }) => {
	await viewerPage.goto("/volumes");
	await expect(viewerPage.getByRole("heading", { name: "Volumes" })).toBeVisible();
	await expect(viewerPage.getByRole("button", { name: "Grow volumes" })).toHaveCount(0);
	await expect(viewerPage.getByRole("button", { name: "Vacuum cluster" })).toHaveCount(0);
});
