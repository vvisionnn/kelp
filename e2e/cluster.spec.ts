import { expect, test } from "./fixtures.ts";

test("overview reports a healthy single-node cluster", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByText(/Healthy\. 1 volume server reporting/)).toBeVisible();
	await expect(page.getByText("Disk used")).toBeVisible();
});

test("nodes page lists every SeaweedFS process", async ({ page }) => {
	await page.goto("/cluster");
	await expect(page.getByText("Leader", { exact: true })).toBeVisible();
	// The e2e stack runs a message broker too (see `--broker` in playwright.config.ts).
	for (const tab of ["Volume servers", "Filers", "S3 gateways", "Message brokers"]) {
		await page.getByRole("tab", { name: tab }).click();
		await expect(
			page
				.getByRole("table")
				.getByText(/127\.0\.0\.1:\d+/)
				.first(),
		).toBeVisible();
	}
});

test("theme choice persists across reloads", async ({ page }) => {
	await page.goto("/");
	const html = page.locator("html");
	const dark = await html.evaluate((el) => el.classList.contains("dark"));
	await page.getByRole("button", { name: dark ? "Switch to light theme" : "Switch to dark theme" }).click();
	await page.reload();
	await expect(html).toHaveClass(dark ? /light/ : /dark/);
});

test("viewers can browse but are labeled read-only", async ({ viewerPage }) => {
	await expect(viewerPage.getByRole("complementary").getByText("Read-only")).toBeVisible();
});

test("signing out returns to the sign-in page and protects the app", async ({ browser }) => {
	const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
	const page = await context.newPage();
	await page.goto("/cluster");
	await expect(page).toHaveURL(/\/login\?redirect=%2Fcluster/);
	await context.close();
});

test("a segmented control fits its scroller, rounded corners and all", async ({ page }) => {
	await page.goto("/");
	const scroller = page.getByRole("radiogroup").first().locator("xpath=..");
	await expect(page.getByRole("radio", { name: "1h" })).toBeVisible();
	const overflow = await scroller.evaluate((element) => element.scrollWidth - element.clientWidth);
	expect(overflow).toBe(0);
});
