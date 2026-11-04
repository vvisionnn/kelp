const UNITS = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];

/** Binary sizes with three significant digits: 1.5 KiB, 228 GiB. */
export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
	const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
	const value = bytes / 1024 ** exponent;
	const text = exponent === 0 ? String(Math.round(value)) : Number(value.toPrecision(3)).toString();
	return `${text} ${UNITS[exponent]}`;
}

const grouped = new Intl.NumberFormat("en-US");
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });

/** Whole numbers with grouping, switching to compact notation from a million. */
export function formatCount(n: number): string {
	return Math.abs(n) >= 1_000_000 ? compact.format(n) : grouped.format(n);
}

/** `part / whole` clamped to 0..1, and 0 when the whole is empty. */
export function ratio(part: number, whole: number): number {
	if (!whole || !Number.isFinite(part / whole)) return 0;
	return Math.min(1, Math.max(0, part / whole));
}

export function formatPercent(fraction: number): string {
	if (fraction <= 0) return "0%";
	if (fraction < 0.001) return "<0.1%";
	return `${Number((fraction * 100).toFixed(1))}%`;
}

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

/** "just now", "3 min ago", "in 5 min", falling back to a date after a week. */
export function formatRelative(iso: string | null, now = Date.now()): string {
	if (!iso) return "never";
	const then = new Date(iso).getTime();
	const seconds = Math.round((then - now) / 1000);
	const abs = Math.abs(seconds);
	const say = (value: number, unit: string) => {
		const text = `${value} ${unit}`;
		return seconds < 0 ? `${text} ago` : `in ${text}`;
	};
	if (abs < 30) return "just now";
	if (abs < 3600) return say(Math.max(1, Math.round(abs / 60)), "min");
	if (abs < 86400) return say(Math.round(abs / 3600), "hr");
	if (abs < 7 * 86400) {
		const days = Math.round(abs / 86400);
		return say(days, days === 1 ? "day" : "days");
	}
	return dateFormat.format(then);
}

const dateTimeFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export function formatDateTime(iso: string | null): string {
	return iso ? dateTimeFormat.format(new Date(iso)) : "—";
}
