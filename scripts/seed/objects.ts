/** The object data of the review environment: a small studio's buckets, with realistic shapes. */
import { accessLog, blob, frondSvg, gradientPng, salesCsv } from "./content.ts";

export interface SeedObject {
	bucket: string;
	key: string;
	body: () => Uint8Array | string;
	type: string;
}

const PALETTES: Array<[[number, number, number], [number, number, number]]> = [
	[
		[8, 18, 16],
		[61, 214, 188],
	],
	[
		[14, 122, 109],
		[242, 246, 245],
	],
	[
		[33, 47, 92],
		[84, 134, 232],
	],
	[
		[92, 41, 30],
		[226, 108, 82],
	],
	[
		[54, 32, 92],
		[157, 116, 224],
	],
];

function pad(n: number, width = 2) {
	return String(n).padStart(width, "0");
}

export function seedObjects(): SeedObject[] {
	const objects: SeedObject[] = [];
	const add = (bucket: string, key: string, type: string, body: () => Uint8Array | string) =>
		objects.push({ bucket, key, type, body });

	// media-assets: brand marks, hero images and a deep thumbnails folder (exercises virtualized lists).
	PALETTES.forEach(([from, to], i) => {
		add("media-assets", `hero/tide-${i + 1}.png`, "image/png", () => gradientPng(960, 540, from, to, i + 1));
	});
	for (const [i, hue] of [150, 165, 180, 195].entries()) {
		add("media-assets", `brand/frond-${hue}.svg`, "image/svg+xml", () => frondSvg(hue, i + 1));
	}
	for (let i = 1; i <= 240; i++) {
		const [from, to] = PALETTES[i % PALETTES.length] as (typeof PALETTES)[number];
		add("media-assets", `thumbnails/thumb-${pad(i, 3)}.png`, "image/png", () =>
			gradientPng(64, 64, from, to, i),
		);
	}
	add(
		"media-assets",
		"README.md",
		"text/markdown",
		() => "# Media assets\n\nBrand marks, hero art and thumbnails for the marketing site.\n",
	);

	// photo-library: dated folders.
	for (const year of [2025, 2026]) {
		for (let month = 1; month <= 12; month += 3) {
			for (let n = 1; n <= 4; n++) {
				const [from, to] = PALETTES[(month + n) % PALETTES.length] as (typeof PALETTES)[number];
				add("photo-library", `${year}/${pad(month)}/IMG_${year}${pad(month)}${pad(n)}.png`, "image/png", () =>
					gradientPng(640, 427, from, to, year + month * 10 + n),
				);
			}
		}
	}

	// web-logs: a month of rotated, gzipped access logs.
	for (let day = 1; day <= 31; day++) {
		add("web-logs", `access/2026/10/${pad(day)}.log.gz`, "application/gzip", () =>
			accessLog(2000, day, Date.UTC(2026, 9, day)),
		);
	}

	// analytics: tabular data and a report.
	add("analytics", "sales/2026-q1.csv", "text/csv", () => salesCsv(90, 1));
	add("analytics", "sales/2026-q2.csv", "text/csv", () => salesCsv(91, 2));
	add("analytics", "reports/summary.json", "application/json", () =>
		JSON.stringify({ quarter: "2026-Q2", orders: 48213, revenueUsd: 1532044.18, topRegion: "west" }, null, 2),
	);

	// backups: large incompressible archives that make volume sizes and capacity meaningful.
	for (let day = 1; day <= 6; day++) {
		add("backups", `postgres/2026-10-${pad(day)}.tar`, "application/x-tar", () => blob(6 * 1024 * 1024, day));
	}

	// ci-artifacts: the layout vvisionnn/s3-artifact writes for GitHub Actions.
	for (const run of [9182736401, 9182736455]) {
		add(
			"ci-artifacts",
			`vvisionnn/kelp/${run}/1/coverage/lcov.info`,
			"text/plain",
			() => "TN:\nSF:server/app.ts\nend_of_record\n",
		);
		add(
			"ci-artifacts",
			`vvisionnn/kelp/${run}/1/web-dist/index.html`,
			"text/html",
			() => "<!doctype html><title>Kelp</title>",
		);
		add("ci-artifacts", `vvisionnn/kelp/${run}/1/playwright-report/report.zip`, "application/zip", () =>
			blob(256 * 1024, run % 997),
		);
	}

	return objects;
}

export const SEED_BUCKETS = [
	"media-assets",
	"photo-library",
	"web-logs",
	"analytics",
	"backups",
	"ci-artifacts",
];
