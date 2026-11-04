import { expect, test as setup } from "@playwright/test";
import { E2E_ADMIN } from "../playwright.config.ts";

setup("sign in as admin", async ({ page }) => {
	await page.goto("/login");
	await page.getByLabel("Username").fill(E2E_ADMIN.username);
	await page.getByLabel("Password").fill(E2E_ADMIN.password);
	await page.getByRole("button", { name: "Sign in" }).click();
	await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
	await page.context().storageState({ path: ".tmp/e2e/admin.json" });
});
