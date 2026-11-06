/**
 * Loading-state QA for a running Kelp: opens each route with the API held back, screenshots the
 * skeleton and the settled page side by side, and reports the layout shift between them.
 *
 *   bun scripts/motion-qa.ts --base http://127.0.0.1:3000 --routes /,/cluster --out .tmp/qa
 *        [--password review-admin] [--delay 900] [--width 1440] [--theme light]
 */
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";

const { values } = parseArgs({
	options: {
		base: { type: "string", default: "http://127.0.0.1:3000" },
		routes: { type: "string", default: "/" },
		out: { type: "string", default: ".tmp/qa" },
		user: { type: "string", default: "admin" },
		password: { type: "string", default: "review-admin" },
		delay: { type: "string", default: "900" },
		width: { type: "string", default: "1440" },
		theme: { type: "string", default: "light" },
	},
});
const delay = Number(values.delay);
const width = Number(values.width);
const SETTLE_MS = 1800;

const browser = await chromium.launch();
const context = await browser.newContext({
	baseURL: values.base as string,
	viewport: { width, height: 900 },
	colorScheme: values.theme === "dark" ? "dark" : "light",
});
const signIn = await context.newPage();
await signIn.goto("/login");
await signIn.getByLabel("Username").fill(values.user as string);
await signIn.getByLabel("Password").fill(values.password as string);
await signIn.getByRole("button", { name: "Sign in" }).click();
await signIn.waitForURL((url) => url.pathname !== "/login");
await signIn.close();
await context.addInitScript(() => {
	const state = { shift: 0 };
	Object.assign(window, { __shift: state });
	new PerformanceObserver((list) => {
		for (const entry of list.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>)
			if (!entry.hadRecentInput) state.shift += entry.value;
	}).observe({ type: "layout-shift", buffered: true });
});
await context.route("**/api/**", async (route) => {
	if (!/\/api\/(auth|session|health)/.test(route.request().url()))
		await new Promise((resolve) => setTimeout(resolve, delay));
	await route.continue();
});

let worst = 0;
for (const path of (values.routes as string).split(",")) {
	const page = await context.newPage();
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto(path);
	const name = path.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "overview";
	await page.waitForTimeout(delay * 0.75);
	const stem = `${values.out}/${name}-${width}-${values.theme}`;
	await page.screenshot({ path: `${stem}-loading.png` });
	await page.waitForTimeout(delay * 2 + SETTLE_MS);
	await page.screenshot({ path: `${stem}-loaded.png` });
	const shift = await page.evaluate(
		() => (window as unknown as { __shift: { shift: number } }).__shift.shift,
	);
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
	worst = Math.max(worst, shift);
	console.log(
		`${path.padEnd(40)} shift ${shift.toFixed(4)}${overflow ? "  OVERFLOW" : ""}${errors.length ? `  ERRORS ${errors.join("; ")}` : ""}`,
	);
	await page.close();
}
await browser.close();
console.log(`worst shift ${worst.toFixed(4)}`);
