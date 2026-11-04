import { expect, test, unique } from "./fixtures.ts";

test("folders and files: create, upload, preview, tag, rename, delete", async ({ page }) => {
	const folder = unique("e2e-files");
	await page.goto("/files");
	await page.getByRole("button", { name: "New folder" }).click();
	await page.getByRole("dialog").getByLabel("Folder name").fill(folder);
	await page.getByRole("dialog").getByRole("button", { name: "Create folder" }).click();
	await page.getByRole("button", { name: folder, exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`path=%2F${folder}`));
	await expect(page.getByText("This folder is empty")).toBeVisible();

	await page.getByTestId("upload-input").setInputFiles([
		{ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("kelp notes") },
		{ name: "data.json", mimeType: "application/json", buffer: Buffer.from('{"answer":42}') },
	]);
	await expect(page.getByRole("region", { name: "Uploads" }).getByText("2 of 2 uploaded")).toBeVisible();
	await expect(page.getByRole("button", { name: "notes.txt", exact: true })).toBeVisible();

	// Preview, then tag the JSON file.
	await page.getByRole("button", { name: "data.json", exact: true }).click();
	const sheet = page.getByRole("dialog");
	await expect(sheet.getByText('"answer": 42')).toBeVisible();
	await sheet.getByRole("button", { name: "Add tag" }).click();
	await sheet.getByLabel("Tag key").fill("team");
	await sheet.getByLabel("Tag value").fill("storage");
	await sheet.getByRole("button", { name: "Save tags" }).click();
	await expect(page.getByText("Tags saved")).toBeVisible();
	await page.reload();
	await page.getByRole("button", { name: "data.json", exact: true }).click();
	await expect(page.getByRole("dialog").getByLabel("Tag value")).toHaveValue("storage");
	await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();

	// Rename.
	await page.getByRole("button", { name: "Actions for notes.txt" }).click();
	await page.getByRole("menuitem", { name: "Move or rename" }).click();
	await page.getByRole("dialog").getByLabel("New path").fill(`/${folder}/renamed.txt`);
	await page.getByRole("dialog").getByRole("button", { name: "Move" }).click();
	await expect(page.getByText("Renamed to renamed.txt")).toBeVisible();
	await expect(page.getByRole("button", { name: "renamed.txt", exact: true })).toBeVisible();

	// Download streams the original bytes.
	const download = page.waitForEvent("download");
	await page.getByRole("button", { name: "Actions for renamed.txt" }).click();
	await page.getByRole("menuitem", { name: "Download" }).click();
	const file = await download;
	expect(file.suggestedFilename()).toBe("renamed.txt");

	// Delete everything in the folder, then the folder.
	await page.getByRole("checkbox", { name: "Select all" }).click();
	await page.getByRole("button", { name: "Delete", exact: true }).click();
	await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
	await expect(page.getByText("2 items deleted")).toBeVisible();
	await expect(page.getByText("This folder is empty")).toBeVisible();
	await page
		.getByRole("navigation", { name: "Folder path" })
		.getByRole("button", { name: "All files" })
		.click();
	await page.getByRole("button", { name: `Actions for ${folder}` }).click();
	await page.getByRole("menuitem", { name: "Delete" }).click();
	await page.getByRole("alertdialog").getByRole("button", { name: "Delete folder" }).click();
	await expect(page.getByText(`${folder} deleted`)).toBeVisible();
});

test("SeaweedFS system folders cannot be deleted from Kelp", async ({ page }) => {
	await page.goto("/files");
	await page.getByRole("button", { name: "Actions for buckets" }).click();
	await page.getByRole("menuitem", { name: "Delete" }).click();
	await page.getByRole("alertdialog").getByRole("button", { name: "Delete folder" }).click();
	await expect(page.getByText("/buckets: This folder belongs to SeaweedFS")).toBeVisible();
	await expect(page.getByRole("button", { name: "buckets", exact: true })).toBeVisible();
});
