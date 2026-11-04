/** Defensive readers for upstream JSON: SeaweedFS omits fields and sends `null` for empty lists. */

export type Raw = Record<string, unknown>;

export const str = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
export const num = (value: unknown, fallback = 0): number => {
	const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
	return typeof n === "number" && Number.isFinite(n) ? n : fallback;
};
export const bool = (value: unknown): boolean => value === true;
export const list = (value: unknown): Raw[] => (Array.isArray(value) ? (value as Raw[]) : []);
export const strings = (value: unknown): string[] =>
	Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
export const obj = (value: unknown): Raw =>
	value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {};

/** ISO timestamp, or null for missing and Go's zero time. */
export function time(value: unknown): string | null {
	const s = str(value);
	if (!s || s.startsWith("0001-01-01")) return null;
	const date = new Date(s);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Nanosecond epoch (number or numeric string) to ISO, or null. */
export function nanos(value: unknown): string | null {
	const n = num(value);
	return n > 0 ? new Date(Math.floor(n / 1e6)).toISOString() : null;
}
