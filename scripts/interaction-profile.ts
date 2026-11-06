/**
 * How fast Kelp answers what people do, not just how fast it loads: for each everyday interaction
 * (switching a time range or a tab, sorting and searching a table, opening the command menu or a
 * dialog, switching theme, folding the sidebar, sweeping the pointer down the sidebar), the time
 * from the input to the next painted frame (Event Timing, the measure behind INP), and how many
 * frames miss 60 fps in the 600 ms of UI change that follows.
 *
 *   bun scripts/interaction-profile.ts --base http://127.0.0.1:3000 [--cpu 4] [--json out.json]
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { chromium, type Page } from "@playwright/test";

const { values } = parseArgs({
	options: {
		base: { type: "string", default: "http://127.0.0.1:3000" },
		user: { type: "string", default: "admin" },
		password: { type: "string", default: "review-admin" },
		cpu: { type: "string", default: "1" },
		json: { type: "string" },
	},
});
const AFTER_MS = 600;

const browser = await chromium.launch();
const context = await browser.newContext({
	baseURL: values.base as string,
	viewport: { width: 1440, height: 900 },
});
await context.addInitScript(() => {
	const perf = { events: [] as number[], frames: [] as number[], recording: false };
	Object.assign(window, { __ix: perf });
	new PerformanceObserver((list) => {
		for (const entry of list.getEntries()) if (perf.recording) perf.events.push(entry.duration);
	}).observe({ type: "event", durationThreshold: 16, buffered: false } as PerformanceObserverInit);
	let last = 0;
	const tick = (now: number) => {
		if (perf.recording && last) perf.frames.push(now - last);
		last = now;
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
});
const page = await context.newPage();
await page.goto("/login");
await page.getByLabel("Username").fill(values.user as string);
await page.getByLabel("Password").fill(values.password as string);
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL((url) => url.pathname !== "/login");
const cdp = await context.newCDPSession(page);
if (Number(values.cpu) > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(values.cpu) });

async function open(path: string) {
	const link = page.locator(`nav a[href="${path}"]`).first();
	if (await link.count()) await link.click();
	else await page.goto(path);
	await page.waitForTimeout(2500);
}

const results: Array<{ name: string; responseMs: number; jankyFrames: number; frames: number }> = [];
async function measure(name: string, act: (page: Page) => Promise<unknown>) {
	await page.evaluate(() => {
		const ix = (window as unknown as { __ix: { events: number[]; frames: number[]; recording: boolean } })
			.__ix;
		ix.events = [];
		ix.frames = [];
		ix.recording = true;
	});
	try {
		await act(page);
	} catch (error) {
		console.log(`${name.padEnd(34)} skipped (${(error as Error).message.split("\n")[0]})`);
		return;
	}
	await page.waitForTimeout(AFTER_MS);
	const { events, frames } = await page.evaluate(() => {
		const ix = (window as unknown as { __ix: { events: number[]; frames: number[]; recording: boolean } })
			.__ix;
		ix.recording = false;
		return { events: ix.events, frames: ix.frames };
	});
	// Event Timing reports durations rounded to 8 ms and only entries over 16 ms; none means a frame.
	const row = {
		name,
		responseMs: Math.round(Math.max(16, ...events)),
		jankyFrames: frames.filter((f) => f > 20).length,
		frames: frames.length,
	};
	results.push(row);
	console.log(
		`${name.padEnd(34)} response ${String(row.responseMs).padStart(4)} ms   janky frames ${row.jankyFrames}/${row.frames}`,
	);
	await page.waitForTimeout(400);
}

const quick = { timeout: 3000 };
await open("/");
await measure("Overview: time range to 6h", (p) => p.getByRole("radio", { name: "6h" }).click(quick));
await measure("Overview: time range back to 1h", (p) => p.getByRole("radio", { name: "1h" }).click(quick));
await measure("Sidebar: sweep the pointer down", async (p) => {
	for (const link of await p.locator('nav[aria-label="Pages"] a').all()) {
		const box = await link.boundingBox();
		if (box) await p.mouse.move(box.x + 20, box.y + box.height / 2, { steps: 2 });
	}
});
await measure("Sidebar: fold to the rail (⌘B)", (p) => p.keyboard.press("Meta+b"));
await measure("Sidebar: unfold (⌘B)", (p) => p.keyboard.press("Meta+b"));
await measure("Theme: switch to dark", (p) =>
	p.getByRole("button", { name: /Switch to dark theme/ }).click(quick),
);
await measure("Theme: switch back to light", (p) =>
	p.getByRole("button", { name: /Switch to light theme/ }).click(quick),
);
await measure("Command menu: open (⌘K)", async (p) => {
	await p.keyboard.press("Meta+k");
	await p.getByRole("dialog").waitFor(quick);
});
await measure("Command menu: type 'vol'", (p) => p.keyboard.type("vol", { delay: 60 }));
await measure("Command menu: close", (p) => p.keyboard.press("Escape"));

await open("/cluster");
await measure("Nodes: switch tab", (p) => p.getByRole("tab").nth(1).click(quick));
await measure("Nodes: switch tab back", (p) => p.getByRole("tab").nth(0).click(quick));

await open("/volumes");
await measure("Volumes: sort a column", (p) =>
	p.getByRole("columnheader", { name: /^Size/ }).getByText("Size").click(quick),
);
await measure("Volumes: type in search", (p) =>
	p
		.getByRole("searchbox")
		.or(p.getByPlaceholder(/search/i))
		.first()
		.pressSequentially("1", { delay: 40 }),
);
await measure("Volumes: filter segment", (p) => p.getByRole("radio", { name: /attention/i }).click(quick));

await open("/access/users");
await measure("Users: open 'Create user'", async (p) => {
	await p.getByRole("button", { name: "Create user" }).click(quick);
	await p.getByRole("dialog").waitFor(quick);
});
await measure("Users: close the dialog", (p) => p.keyboard.press("Escape"));

const worst = Math.max(...results.map((r) => r.responseMs));
const janky = results.reduce((s, r) => s + r.jankyFrames, 0);
const frames = results.reduce((s, r) => s + r.frames, 0);
console.log(
	`\nslowest response ${worst} ms, janky frames ${janky}/${frames} (${((janky / frames) * 100).toFixed(1)}%)`,
);
if (values.json) writeFileSync(values.json, JSON.stringify(results, null, 2));
await browser.close();
