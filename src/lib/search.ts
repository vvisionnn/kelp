/*
 * Search-param readers for routes' `validateSearch`. A value that isn't text, or isn't one of its
 * words, reads as missing, so a hand-edited URL opens the page with its defaults instead of failing.
 * Small on purpose: a schema library here would ride along in the first download of every page.
 */

/** The param when it is text. */
export function text(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

/** The param when it is one of `words`. */
export function oneOf<const T extends string>(value: unknown, words: readonly T[]): T | undefined {
	return typeof value === "string" && (words as readonly string[]).includes(value) ? (value as T) : undefined;
}
