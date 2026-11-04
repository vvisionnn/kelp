import { stackPorts } from "../scripts/stack-lib.ts";
import { expect, test } from "./fixtures.ts";

const ports = stackPorts(Number(process.env.KELP_E2E_OFFSET ?? 100));

test("settings show the live cluster and Kelp's connections", async ({ page }) => {
	await page.goto("/settings");
	await expect(page.getByText(`127.0.0.1:${ports.master}`, { exact: true })).toBeVisible();
	await expect(page.getByText("On and running")).toBeVisible();
	await expect(page.getByText(`http://127.0.0.1:${ports.admin}`, { exact: true })).toBeVisible();
	await expect(page.getByText("Enabled", { exact: true })).toBeVisible();
});

test("theme cards switch and remember the theme", async ({ page }) => {
	await page.goto("/settings");
	await page.getByRole("radio", { name: "Abyss" }).click();
	await expect(page.locator("html")).toHaveClass(/dark/);
	await page.reload();
	await expect(page.locator("html")).toHaveClass(/dark/);
	await expect(page.getByRole("radio", { name: "Abyss" })).toBeChecked();
	await page.getByRole("radio", { name: "Tidepool" }).click();
	await expect(page.locator("html")).toHaveClass(/light/);
});
