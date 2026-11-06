import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";

const HOLD_MS = 700;
/** Above this the layout visibly jumps when data lands. 0.1 is what browsers call "poor". */
const MAX_SHIFT = 0.03;
const ROUTES = [
	"/",
	"/cluster",
	"/volumes",
	"/collections",
	"/erasure-coding",
	"/buckets",
	"/files",
	"/tables",
	"/access/users",
	"/access/groups",
	"/access/service-accounts",
	"/access/policies",
	"/maintenance",
	"/maintenance/jobs",
	"/messaging",
	"/settings",
];

async function holdApi(page: Page) {
	await page.addInitScript(() => {
		const state = { shift: 0, moved: [] as string[] };
		Object.assign(window, { kelpShift: state });
		type Shift = {
			value: number;
			hadRecentInput: boolean;
			sources: Array<{ node: Node | null; previousRect: DOMRect; currentRect: DOMRect }>;
		};
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries() as unknown as Shift[]) {
				if (entry.hadRecentInput) continue;
				state.shift += entry.value;
				// Names what moved, so a failure says where to look.
				for (const { node, previousRect: from, currentRect: to } of entry.sources)
					state.moved.push(
						`${(node as Element | null)?.outerHTML?.slice(0, 80) ?? node?.nodeName} ${from.y | 0}->${to.y | 0} h${from.height | 0}->${to.height | 0}`,
					);
			}
		}).observe({ type: "layout-shift", buffered: true });
	});
	await page.route("**/api/**", async (route) => {
		if (!route.request().url().includes("/api/auth/"))
			await new Promise((resolve) => setTimeout(resolve, HOLD_MS));
		await route.continue();
	});
}

test("a slow page shows its skeleton in place, then the content", async ({ page }) => {
	await holdApi(page);
	await page.goto("/");
	await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
	await expect(page.getByRole("status", { name: "Loading overview" })).toBeVisible();
	await expect(page.getByText("Disk used")).toBeVisible();
	await expect(page.getByRole("status", { name: "Loading overview" })).toBeHidden();
});

for (const route of ROUTES) {
	test(`${route} keeps its layout still while data lands`, async ({ page }) => {
		await holdApi(page);
		await page.goto(route);
		await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
		await page.waitForTimeout(HOLD_MS);
		const { shift, moved } = await page.evaluate(
			() => (window as unknown as { kelpShift: { shift: number; moved: string[] } }).kelpShift,
		);
		expect(shift, moved.slice(0, 8).join("\n")).toBeLessThan(MAX_SHIFT);
	});
}

test("the theme switch spreads from the pointer and lands on the new theme", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByText("Disk used")).toBeVisible();
	const root = page.locator("html");
	const wasDark = await root.evaluate((el) => el.classList.contains("dark"));
	await page.getByRole("button", { name: /^Switch to .* theme$/ }).click();
	await expect(root).toHaveClass(wasDark ? /light/ : /dark/);
	await expect(root).not.toHaveAttribute("data-transition", "theme");
});

test("reduced motion lands content without blur or rolling digits", async ({ browser }) => {
	const context = await browser.newContext({
		reducedMotion: "reduce",
		storageState: ".tmp/e2e/admin.json",
	});
	const page = await context.newPage();
	await page.goto("/");
	await expect(page.getByText("Disk used")).toBeVisible();
	await expect(page.locator(".sr-only", { hasText: /^Updated/ })).toHaveCount(0);
	await context.close();
});
