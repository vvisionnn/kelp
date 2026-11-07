/**
 * The README's screenshots, in both themes, from a running Kelp with data (`bun run review`, then
 * let its traffic run for about 15 minutes, so the charts' window is past the burst of seeding):
 *
 *   bun scripts/screenshots.ts [--base http://127.0.0.1:3000] [--out docs/screenshots]
 *        [--range 15m] [--only overview,users]
 *
 * Writes `<name>-light.png` and `<name>-dark.png` for each page; the README shows the one matching
 * the reader's GitHub theme.
 */
import { mkdirSync } from "node:fs";
import { parseArgs } from "node:util";
import { type BrowserContext, chromium, type Page } from "@playwright/test";

const { values } = parseArgs({
	options: {
		base: { type: "string", default: "http://127.0.0.1:3000" },
		out: { type: "string", default: "docs/screenshots" },
		user: { type: "string", default: "admin" },
		password: { type: "string", default: "review-admin" },
		range: { type: "string", default: "15m" },
		only: { type: "string" },
	},
});

/** Long enough for entrances to finish: counters spin, charts draw, rows rise. */
const SETTLE_MS = 2500;

/** The Iceberg table with the most commits (highest metadata version), so the shot has a history. */
async function richestTable(page: Page): Promise<string> {
	const { buckets } = (await (await page.request.get("/api/tables/buckets")).json()) as {
		buckets: Array<{ name: string }>;
	};
	let best: { path: string; version: number } | undefined;
	for (const { name } of buckets) {
		const { tables } = (await (
			await page.request.get(`/api/tables/buckets/${encodeURIComponent(name)}`)
		).json()) as {
			tables: Array<{ namespace: string; name: string; metadataLocation: string | null }>;
		};
		for (const table of tables) {
			const version = Number(table.metadataLocation?.match(/\/v(\d+)\.metadata\.json$/)?.[1] ?? 0);
			if (version > (best?.version ?? 0))
				best = { path: `/tables/${name}/${table.namespace}/${table.name}`, version };
		}
	}
	if (!best) throw new Error("No Iceberg table with data to show; run `bun run seed` first.");
	return best.path;
}

const PAGES: Array<{ name: string; path: string | ((page: Page) => Promise<string>) }> = [
	{ name: "overview", path: "/" },
	{ name: "volumes", path: "/volumes" },
	{ name: "erasure-coding", path: "/erasure-coding" },
	{ name: "buckets", path: "/buckets" },
	{ name: "table", path: richestTable },
	{ name: "maintenance", path: "/maintenance" },
	{ name: "users", path: "/access/users" },
];

async function signIn(context: BrowserContext) {
	const page = await context.newPage();
	await page.goto("/login");
	await page.getByLabel("Username").fill(values.user as string);
	await page.getByLabel("Password").fill(values.password as string);
	await page.getByRole("button", { name: "Sign in" }).click();
	await page.waitForURL((url) => url.pathname !== "/login");
	return page;
}

mkdirSync(values.out as string, { recursive: true });
const only = values.only?.split(",");
const browser = await chromium.launch();
for (const theme of ["light", "dark"] as const) {
	const context = await browser.newContext({
		baseURL: values.base as string,
		viewport: { width: 1440, height: 900 },
		deviceScaleFactor: 2,
		colorScheme: theme,
	});
	const page = await signIn(context);
	for (const shot of PAGES) {
		if (only && !only.includes(shot.name)) continue;
		const path = typeof shot.path === "string" ? shot.path : await shot.path(page);
		await page.goto(path);
		await page.waitForFunction(
			() =>
				document.querySelector("[data-page] h1") &&
				!document.querySelector(
					'[data-page] [role="status"][aria-label^="Loading"], [data-page] [aria-busy="true"]',
				),
			undefined,
			{ timeout: 20_000 },
		);
		// Pages with charts show the chosen time range.
		const range = page.getByRole("radio", { name: values.range as string, exact: true });
		if (await range.count()) await range.first().click();
		// Away from the sidebar, so no row shows a hover tint.
		await page.mouse.move(1439, 899);
		await page.waitForTimeout(SETTLE_MS);
		const file = `${values.out}/${shot.name}-${theme}.png`;
		await page.screenshot({ path: file });
		console.log(file);
	}
	await context.close();
}
await browser.close();
