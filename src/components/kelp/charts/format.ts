/** Compact numbers for axes and tiles: 950, 1.2K, 34K, 1.5M. */
export function compact(value: number): string {
	if (!Number.isFinite(value)) return "–";
	const abs = Math.abs(value);
	if (abs >= 1e9) return `${trim(value / 1e9)}B`;
	if (abs >= 1e6) return `${trim(value / 1e6)}M`;
	if (abs >= 1e3) return `${trim(value / 1e3)}K`;
	if (abs > 0 && abs < 100) return trim(value);
	return String(Math.round(value));
}

function trim(value: number): string {
	return value.toFixed(Math.abs(value) >= 100 ? 0 : 1).replace(/\.0$/, "");
}

/** Requests per second, e.g. "12.4/s", "0.3/s", "0/s". */
export function perSecond(value: number): string {
	return `${compact(value)}/s`;
}

/** Milliseconds as "4.2 ms", "320 ms" or "1.4 s". */
export function millis(value: number): string {
	if (value >= 1000) return `${trim(value / 1000)} s`;
	return `${trim(value)} ms`;
}

// Built once: every chart formats each of its samples, and a formatter is costly to create.
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const TIME_SECONDS = new Intl.DateTimeFormat("en-GB", {
	hour: "2-digit",
	minute: "2-digit",
	second: "2-digit",
});
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/** A clock time for axes and tooltips: "14:05". Includes the day for ranges over a day. */
export function clock(t: number, withDay = false): string {
	const time = TIME.format(t);
	return withDay ? `${DAY.format(t)} ${time}` : time;
}

/** A clock time with seconds, for axes spanning only a few minutes: "14:05:30". */
export function clockSeconds(t: number): string {
	return TIME_SECONDS.format(t);
}
