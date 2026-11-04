import { S3_CREDENTIALS, stackPorts } from "../scripts/stack-lib.ts";
import { expect, test, unique } from "./fixtures.ts";
import { s3Put } from "./s3.ts";

const s3 = `http://127.0.0.1:${stackPorts(Number(process.env.KELP_E2E_OFFSET ?? 100)).s3}`;

test("a bucket's whole life: create, configure, publish an object, delete", async ({ page, request }) => {
	const name = unique("e2e-bucket");
	await page.goto("/buckets");
	await page.getByRole("button", { name: "Create bucket" }).first().click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel("Name").fill(name);
	await dialog.getByRole("switch", { name: /Limit storage/ }).click();
	await dialog.getByLabel("Quota size").fill("2");
	await dialog.getByRole("switch", { name: /Keep every version/ }).click();
	await dialog.getByRole("button", { name: "Create bucket" }).click();

	await expect(page).toHaveURL(new RegExp(`/buckets/${name}$`));
	await expect(page.getByRole("heading", { name })).toBeVisible();
	await expect(page.getByText("Versioned")).toBeVisible();
	await expect(page.getByText("of 2 GiB")).toBeVisible();

	// Upload an object through the bucket's object browser.
	await page.getByTestId("upload-input").setInputFiles({
		name: "hello.txt",
		mimeType: "text/plain",
		buffer: Buffer.from("hello from kelp"),
	});
	await expect(page.getByRole("button", { name: "hello.txt", exact: true })).toBeVisible();

	// Settings: grow the quota.
	await page.getByRole("tab", { name: "Settings" }).click();
	await page.getByLabel("Quota size").fill("3");
	await page.getByRole("button", { name: "Save quota" }).click();
	await expect(page.getByText("Quota set to 3 GiB")).toBeVisible();

	// Lifecycle: add a rule and save it.
	await page.getByRole("tab", { name: "Lifecycle" }).click();
	await page.getByRole("button", { name: "Add rule" }).click();
	const sheet = page.getByRole("dialog");
	await sheet.getByLabel("Name").fill("expire-tmp");
	await sheet.getByLabel("Key prefix").fill("tmp/");
	await sheet.getByRole("button", { name: "Keep rule" }).click();
	await page.getByRole("button", { name: "Save rules" }).click();
	await expect(page.getByText("Lifecycle rules saved")).toBeVisible();
	await page.reload();
	await expect(page.getByText("Objects under tmp/")).toBeVisible();

	// Policy: anonymous reads start working once the public-read template is saved.
	expect((await request.get(`${s3}/${name}/hello.txt`)).status()).toBe(403);
	await page.getByRole("tab", { name: "Policy" }).click();
	await page.getByRole("button", { name: "Start from a template" }).click();
	await page.getByRole("menuitem", { name: /Public read/ }).click();
	await page.getByRole("button", { name: "Save policy" }).click();
	await expect(page.getByText("Bucket policy saved")).toBeVisible();
	await expect
		.poll(async () => (await request.get(`${s3}/${name}/hello.txt`)).status(), { timeout: 10_000 })
		.toBe(200);
	expect(await (await request.get(`${s3}/${name}/hello.txt`)).text()).toBe("hello from kelp");

	// Delete with the typed confirmation.
	await page.getByRole("button", { name: "Delete bucket" }).click();
	const confirm = page.getByRole("alertdialog");
	await confirm.getByRole("textbox").fill(name);
	await confirm.getByRole("button", { name: "Delete bucket" }).click();
	await expect(page).toHaveURL(/\/buckets$/);
	await expect(page.getByText(`Bucket ${name} deleted`)).toBeVisible();
	await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);
});

test("object lock is chosen at creation and shown afterwards", async ({ page }) => {
	const name = unique("e2e-locked");
	await page.goto("/buckets");
	await page.getByRole("button", { name: "Create bucket" }).first().click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel("Name").fill(name);
	await dialog.getByRole("switch", { name: /Object lock/ }).click();
	await dialog.getByRole("radio", { name: /Compliance/ }).click();
	await dialog.getByLabel("Default retention (days)").fill("1");
	await dialog.getByRole("button", { name: "Create bucket" }).click();
	await expect(page.getByText("Compliance lock")).toBeVisible();
	await page.getByRole("tab", { name: "Settings" }).click();
	await expect(page.getByText("New objects are kept for 1 days.")).toBeVisible();
});

test("viewers can open buckets but not change them", async ({ viewerPage }) => {
	await viewerPage.goto("/buckets");
	await expect(viewerPage.getByRole("heading", { level: 1, name: "Buckets" })).toBeVisible();
	await expect(viewerPage.getByRole("button", { name: "Create bucket" })).toHaveCount(0);
});

test("objects in a versioned bucket show as objects with their version history", async ({ page }) => {
	const name = unique("e2e-versions");
	await page.goto("/buckets");
	await page.getByRole("button", { name: "Create bucket" }).first().click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel("Name").fill(name);
	await dialog.getByRole("switch", { name: /Keep every version/ }).click();
	await dialog.getByRole("button", { name: "Create bucket" }).click();
	await expect(page).toHaveURL(new RegExp(`/buckets/${name}$`));
	await expect(page.getByRole("heading", { name })).toBeVisible();

	// Two S3 writes of the same key create two versions in SeaweedFS's `notes.md.versions/` folder.
	await s3Put(s3, S3_CREDENTIALS, name, "notes.md", "first draft", "text/markdown");
	await s3Put(s3, S3_CREDENTIALS, name, "notes.md", "second draft", "text/markdown");

	await page.reload();
	await page.getByRole("button", { name: "notes.md", exact: true }).click();
	const sheet = page.getByRole("dialog");
	await expect(sheet.getByText("second draft")).toBeVisible();
	const versions = sheet.getByRole("region", { name: "Versions" });
	await expect(versions.getByRole("listitem")).toHaveCount(2);
	await expect(versions.getByText("Current")).toBeVisible();
	await expect(page.getByText("notes.md.versions")).toHaveCount(0);
});
