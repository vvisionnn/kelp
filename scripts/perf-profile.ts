/**
 * Performance profile of a running Kelp, in the numbers a person feels:
 *
 * - Cold load of the overview with an empty cache: bytes on the wire, first contentful paint,
 *   when the data is on screen, and main-thread blocking (long tasks over 50 ms).
 * - Moving between pages from the sidebar, first visit and revisit: time until the new page's
 *   content stands, the longest frame, and frames that miss 60 fps while it happens.
 * - Scrolling the overview: frames that miss 60 fps.
 *
 *   bun scripts/perf-profile.ts --base http://127.0.0.1:3000 [--cpu 4] [--network 4g] [--json out.json]
 *
 * `--cpu` slows the CPU like a mid-range laptop or phone (Chrome DevTools throttling); `--network 4g`
 * adds 150 ms of latency and caps the link at 9 Mbit/s, like a good mobile connection.
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { type CDPSession, chromium, type Page } from "@playwright/test";

const { values } = parseArgs({
	options: {
		base: { type: "string", default: "http://127.0.0.1:3000" },
		user: { type: "string", default: "admin" },
		password: { type: "string", default: "review-admin" },
		cpu: { type: "string", default: "1" },
		network: { type: "string", default: "none" },
		routes: { type: "string", default: "/cluster,/volumes,/buckets,/tables,/access/users,/maintenance,/" },
		json: { type: "string" },
		headed: { type: "boolean", default: false },
	},
});
const CPU = Number(values.cpu);
const SETTLE_MS = 1500;

const browser = await chromium.launch({ headless: !values.headed });
const context = await browser.newContext({
	baseURL: values.base as string,
	viewport: { width: 1440, height: 900 },
});
const signIn = await context.newPage();
await signIn.goto("/login");
await signIn.getByLabel("Username").fill(values.user as string);
await signIn.getByLabel("Password").fill(values.password as string);
await signIn.getByRole("button", { name: "Sign in" }).click();
await signIn.waitForURL((url) => url.pathname !== "/login");
await signIn.close();

await context.addInitScript(() => {
	const perf = { longTasks: [] as number[], frames: [] as number[], recording: false };
	Object.assign(window, { __perf: perf });
	new PerformanceObserver((list) => {
		for (const entry of list.getEntries()) perf.longTasks.push(entry.duration);
	}).observe({ type: "longtask", buffered: true });
	let last = 0;
	const tick = (now: number) => {
		if (perf.recording && last) perf.frames.push(now - last);
		last = now;
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
});

async function throttle(page: Page): Promise<CDPSession> {
	const cdp = await context.newCDPSession(page);
	await cdp.send("Network.enable");
	await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
	if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
	if (values.network === "4g")
		await cdp.send("Network.emulateNetworkConditions", {
			offline: false,
			latency: 150,
			downloadThroughput: (9 * 1024 * 1024) / 8,
			uploadThroughput: (1.5 * 1024 * 1024) / 8,
		});
	return cdp;
}

/** Waits until no loading placeholder remains on the page, and returns how long that took. */
async function settled(page: Page, start: number): Promise<number> {
	await page.waitForFunction(
		() =>
			!document.querySelector(
				'[data-page] [role="status"][aria-label^="Loading"], [data-page] [aria-busy="true"]',
			) && document.querySelector("[data-page] h1"),
		undefined,
		{ timeout: 30_000, polling: 16 },
	);
	return Date.now() - start;
}

const pct = (xs: number[], p: number) => {
	if (!xs.length) return 0;
	const sorted = [...xs].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
};
const round = (n: number) => Math.round(n);

// Cold load: empty cache, the overview from scratch.
const cold = await context.newPage();
const cdp = await throttle(cold);
let bytes = 0;
let jsBytes = 0;
cdp.on("Network.loadingFinished", (e: { encodedDataLength: number; requestId: string }) => {
	bytes += e.encodedDataLength;
});
const types = new Map<string, string>();
cdp.on("Network.responseReceived", (e: { requestId: string; type: string }) =>
	types.set(e.requestId, e.type),
);
cdp.on("Network.loadingFinished", (e: { encodedDataLength: number; requestId: string }) => {
	if (types.get(e.requestId) === "Script") jsBytes += e.encodedDataLength;
});
await cdp.send("Network.clearBrowserCache");
const coldStart = Date.now();
await cold.goto("/", { waitUntil: "commit" });
const contentMs = await settled(cold, coldStart);
await cold.waitForTimeout(SETTLE_MS);
const coldPaint = await cold.evaluate(() => {
	const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
	const perf = (window as unknown as { __perf: { longTasks: number[] } }).__perf;
	const blocking = perf.longTasks.reduce((sum, d) => sum + Math.max(0, d - 50), 0);
	return { fcp, blocking, longest: Math.max(0, ...perf.longTasks) };
});
const coldResult = {
	transferKB: round(bytes / 1024),
	scriptKB: round(jsBytes / 1024),
	fcpMs: round(coldPaint.fcp),
	contentMs,
	blockingMs: round(coldPaint.blocking),
	longestTaskMs: round(coldPaint.longest),
};
console.log(
	`cold load      transfer ${coldResult.transferKB} KB (JS ${coldResult.scriptKB} KB)  FCP ${coldResult.fcpMs} ms  content ${contentMs} ms  blocking ${coldResult.blockingMs} ms  longest task ${coldResult.longestTaskMs} ms`,
);

// Sidebar navigation, first visit then revisit, in the same tab like a person.
const nav: Array<Record<string, number | string>> = [];
for (const round_ of ["first", "revisit"]) {
	for (const path of (values.routes as string).split(",")) {
		const link = cold.locator(`nav a[href="${path}"]`).first();
		await link.hover();
		await cold.waitForTimeout(250);
		await cold.evaluate(() => {
			const perf = (
				window as unknown as { __perf: { frames: number[]; longTasks: number[]; recording: boolean } }
			).__perf;
			perf.frames = [];
			perf.longTasks = [];
			perf.recording = true;
		});
		const start = Date.now();
		await link.click();
		await cold.waitForURL((url) => url.pathname === path);
		const ms = await settled(cold, start);
		await cold.waitForTimeout(700);
		const stats = await cold.evaluate(() => {
			const perf = (
				window as unknown as { __perf: { frames: number[]; longTasks: number[]; recording: boolean } }
			).__perf;
			perf.recording = false;
			return { frames: perf.frames, longTasks: perf.longTasks };
		});
		const janky = stats.frames.filter((f) => f > 20).length;
		const row = {
			round: round_,
			path,
			contentMs: ms,
			frames: stats.frames.length,
			jankyFrames: janky,
			p95FrameMs: round(pct(stats.frames, 95)),
			maxFrameMs: round(Math.max(0, ...stats.frames)),
			blockingMs: round(stats.longTasks.reduce((s, d) => s + Math.max(0, d - 50), 0)),
		};
		nav.push(row);
		console.log(
			`${round_.padEnd(8)} ${path.padEnd(16)} content ${String(ms).padStart(5)} ms  max frame ${String(row.maxFrameMs).padStart(4)} ms  p95 ${String(row.p95FrameMs).padStart(3)} ms  janky ${janky}/${row.frames}  blocking ${row.blockingMs} ms`,
		);
		await cold.waitForTimeout(SETTLE_MS);
	}
}

// Scrolling the overview.
await cold.locator('nav a[href="/"]').first().click();
await settled(cold, Date.now());
await cold.waitForTimeout(SETTLE_MS);
await cold.mouse.move(900, 500);
await cold.evaluate(() => {
	const perf = (window as unknown as { __perf: { frames: number[]; recording: boolean } }).__perf;
	perf.frames = [];
	perf.recording = true;
});
for (let i = 0; i < 30; i++) {
	await cold.mouse.wheel(0, i < 15 ? 80 : -80);
	await cold.waitForTimeout(32);
}
const scroll = await cold.evaluate(() => {
	const perf = (window as unknown as { __perf: { frames: number[]; recording: boolean } }).__perf;
	perf.recording = false;
	return perf.frames;
});
const scrollResult = {
	frames: scroll.length,
	jankyFrames: scroll.filter((f) => f > 20).length,
	p95FrameMs: round(pct(scroll, 95)),
	maxFrameMs: round(Math.max(0, ...scroll)),
};
console.log(
	`scroll         max frame ${scrollResult.maxFrameMs} ms  p95 ${scrollResult.p95FrameMs} ms  janky ${scrollResult.jankyFrames}/${scrollResult.frames}`,
);

if (values.json)
	writeFileSync(values.json, JSON.stringify({ cold: coldResult, nav, scroll: scrollResult }, null, 2));
await browser.close();
