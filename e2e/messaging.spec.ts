import { expect, test, unique } from "./fixtures.ts";

/** A fresh broker needs a few seconds to win the balancer election before topics can be created. */
const ELECTION = { timeout: 90_000 };

test("creates a topic, tunes its retention, and purges expired data", async ({ page }) => {
	const namespace = unique("e2e").replaceAll("-", "_");
	await page.goto("/messaging");
	await expect(page.getByLabel("Leader")).toBeVisible(ELECTION);

	await page.getByRole("button", { name: "Create topic" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel("Namespace").fill(namespace);
	await dialog.getByLabel("Name", { exact: true }).fill("orders");
	await dialog.getByLabel("Partitions").fill("3");
	await dialog.getByLabel("Keep messages for").fill("2");
	await dialog.getByRole("button", { name: "days" }).click();
	await dialog.getByRole("button", { name: "Create topic" }).click();

	await expect(page).toHaveURL(new RegExp(`/messaging/${namespace}/orders$`));
	await expect(page.getByRole("img", { name: "3 partitions across 1 broker" })).toBeVisible();
	await expect(page.getByText("Currently: 2 days.")).toBeVisible();

	await page.getByLabel("Keep messages for").fill("36");
	await page.getByRole("button", { name: "hours" }).click();
	await page.getByRole("button", { name: "Save retention" }).click();
	await expect(page.getByText(`Retention for ${namespace}.orders saved`)).toBeVisible();
	await expect(page.getByText("Currently: 36 hours.")).toBeVisible();

	await page.locator("header[data-toolbar]").getByRole("link", { name: "Messaging" }).click();
	const row = page.getByRole("row").filter({ hasText: `${namespace}.orders` });
	await expect(row).toContainText("36 hours");
	await expect(row).toContainText("3");

	await page.getByRole("button", { name: "Purge expired data" }).click();
	await page.getByRole("alertdialog").getByRole("button", { name: "Purge expired data" }).click();
	await expect(page.getByText("Expired messages purged")).toBeVisible();
});

test("refuses to recreate an existing topic", async ({ page }) => {
	const namespace = unique("dup").replaceAll("-", "_");
	await page.goto("/messaging");
	await expect(page.getByLabel("Leader")).toBeVisible(ELECTION);
	for (const attempt of [1, 2]) {
		await page.getByRole("button", { name: "Create topic" }).click();
		const dialog = page.getByRole("dialog");
		await dialog.getByLabel("Namespace").fill(namespace);
		await dialog.getByLabel("Name", { exact: true }).fill("events");
		await dialog.getByRole("switch").click();
		await dialog.getByRole("button", { name: "Create topic" }).click();
		if (attempt === 1) {
			await expect(page).toHaveURL(new RegExp(`/messaging/${namespace}/events$`));
			await expect(page.getByText("Currently: Keep forever.")).toBeVisible();
			await page.goto("/messaging");
		} else {
			await expect(page.getByText(`Topic ${namespace}.events already exists`)).toBeVisible();
		}
	}
});

test("viewers browse topics without changing them", async ({ viewerPage }) => {
	await viewerPage.goto("/messaging");
	await expect(viewerPage.getByRole("heading", { level: 1, name: "Messaging" })).toBeVisible();
	await expect(viewerPage.getByRole("region", { name: "Brokers" })).toBeVisible();
	await expect(viewerPage.getByRole("button", { name: "Create topic" })).toHaveCount(0);
});
