import { test as base, expect, type Page } from "@playwright/test";
import { E2E_VIEWER } from "../playwright.config.ts";

/** A name that will not collide across parallel workers or reruns. */
export function unique(prefix: string): string {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export const test = base.extend<{ viewerPage: Page }>({
	viewerPage: async ({ browser }, use) => {
		const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
		const page = await context.newPage();
		await page.goto("/login");
		await page.getByLabel("Username").fill(E2E_VIEWER.username);
		await page.getByLabel("Password").fill(E2E_VIEWER.password);
		await page.getByRole("button", { name: "Sign in" }).click();
		await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
		await use(page);
		await context.close();
	},
});

export { expect };
