/**
 * Kelp loads each page's code on first visit. After an upgrade (or a rebuild in development) those
 * files are renamed, so a tab opened before it asks for files that no longer exist. The fix is the
 * newer build: reload once, quietly, instead of showing an error.
 */

const KEY = "kelp-reloaded-for-build";
/** A reload that didn't help within this long is not retried, so a real outage can't loop. */
const RETRY_AFTER_MS = 60_000;

/** True for the errors browsers raise when a page's code file is gone. */
export function isStaleBuildError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	return /dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(
		error.message,
	);
}

/** Reloads into the current build unless that was just tried. Returns whether it reloaded. */
export function reloadForNewBuild(reload: () => void, now = Date.now()): boolean {
	const last = sessionStorage.getItem(KEY);
	if (last !== null && now - Number(last) < RETRY_AFTER_MS) return false;
	sessionStorage.setItem(KEY, String(now));
	reload();
	return true;
}
