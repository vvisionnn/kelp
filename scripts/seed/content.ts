/**
 * Deterministic sample content for the review environment: real PNGs, SVGs, documents, logs and
 * binary blobs, so every preview and size column in Kelp has something meaningful to show.
 */
import { deflateSync, gzipSync } from "node:zlib";

/** Small seeded PRNG so every seed run produces identical files. */
export function random(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});

export function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
	const out = new Uint8Array(12 + data.length);
	const view = new DataView(out.buffer);
	view.setUint32(0, data.length);
	out.set(new TextEncoder().encode(type), 4);
	out.set(data, 8);
	view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
	return out;
}

type Rgb = [number, number, number];

/** An RGB PNG: a soft diagonal gradient between two colors with gentle "water" ripples. */
export function gradientPng(width: number, height: number, from: Rgb, to: Rgb, seed = 1): Uint8Array {
	const rand = random(seed);
	const phase = rand() * Math.PI * 2;
	const raw = new Uint8Array((width * 3 + 1) * height);
	for (let y = 0; y < height; y++) {
		const row = y * (width * 3 + 1);
		raw[row] = 0;
		for (let x = 0; x < width; x++) {
			const ripple = Math.sin((x + y * 0.6) / 9 + phase) * 0.05;
			const t = Math.min(1, Math.max(0, (x / width + y / height) / 2 + ripple));
			for (let c = 0; c < 3; c++) {
				raw[row + 1 + x * 3 + c] = Math.round(
					(from[c] as number) + ((to[c] as number) - (from[c] as number)) * t,
				);
			}
		}
	}
	const header = new Uint8Array(13);
	const view = new DataView(header.buffer);
	view.setUint32(0, width);
	view.setUint32(4, height);
	header.set([8, 2, 0, 0, 0], 8);
	const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
	const parts = [
		signature,
		chunk("IHDR", header),
		chunk("IDAT", deflateSync(raw)),
		chunk("IEND", new Uint8Array()),
	];
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

/** A kelp-frond illustration as SVG. */
export function frondSvg(hue: number, seed = 1): string {
	const rand = random(seed);
	const fronds = Array.from({ length: 7 }, (_, i) => {
		const x = 30 + i * 40 + rand() * 10;
		const sway = 18 + rand() * 20;
		return `<path d="M${x} 300 C ${x - sway} 220, ${x + sway} 140, ${x - sway / 2} 40" stroke="hsl(${hue + i * 6} 55% ${38 + i * 4}%)" stroke-width="${5 + rand() * 4}" fill="none" stroke-linecap="round"/>`;
	}).join("");
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 300"><rect width="320" height="300" fill="hsl(${hue} 40% 12%)"/>${fronds}</svg>`;
}

/** Access-log lines in the common log format, gzip-compressed like a rotated log. */
export function accessLog(lines: number, seed = 1, start = Date.UTC(2026, 9, 1)): Uint8Array {
	const rand = random(seed);
	const paths = ["/", "/pricing", "/docs/getting-started", "/api/v1/orders", "/assets/app.js", "/login"];
	const statuses = [200, 200, 200, 200, 304, 301, 404, 500];
	const out: string[] = [];
	for (let i = 0; i < lines; i++) {
		const ip = `10.${Math.floor(rand() * 255)}.${Math.floor(rand() * 255)}.${Math.floor(rand() * 255)}`;
		const time = new Date(start + i * 1700).toISOString();
		const path = paths[Math.floor(rand() * paths.length)];
		const status = statuses[Math.floor(rand() * statuses.length)];
		out.push(`${ip} - - [${time}] "GET ${path} HTTP/1.1" ${status} ${Math.floor(rand() * 40_000)}`);
	}
	return gzipSync(`${out.join("\n")}\n`);
}

/** CSV with a header row: daily sales per region. */
export function salesCsv(days: number, seed = 1): string {
	const rand = random(seed);
	const regions = ["north", "south", "east", "west"];
	const rows = ["date,region,orders,revenue_usd"];
	for (let d = 0; d < days; d++) {
		const date = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
		for (const region of regions) {
			const orders = 40 + Math.floor(rand() * 160);
			rows.push(`${date},${region},${orders},${(orders * (18 + rand() * 30)).toFixed(2)}`);
		}
	}
	return `${rows.join("\n")}\n`;
}

/** Incompressible bytes of a given size, for backup-like objects that fill volumes realistically. */
export function blob(size: number, seed = 1): Uint8Array {
	const rand = random(seed);
	const out = new Uint8Array(size);
	for (let i = 0; i < size; i += 4) {
		const value = Math.floor(rand() * 4294967296);
		out[i] = value & 0xff;
		out[i + 1] = (value >>> 8) & 0xff;
		out[i + 2] = (value >>> 16) & 0xff;
		out[i + 3] = (value >>> 24) & 0xff;
	}
	return out;
}
