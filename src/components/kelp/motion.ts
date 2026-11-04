import { useSyncExternalStore } from "react";

const REDUCED = "(prefers-reduced-motion: reduce)";

function subscribe(callback: () => void) {
	const query = window.matchMedia(REDUCED);
	query.addEventListener("change", callback);
	return () => query.removeEventListener("change", callback);
}

/** Tracks the OS "reduce motion" preference live. */
export function usePrefersReducedMotion(): boolean {
	return useSyncExternalStore(
		subscribe,
		() => window.matchMedia(REDUCED).matches,
		() => false,
	);
}

/** Whether the browser can run the WebGL2 effects. Releases the probe context right away. */
export function canUseWebGL2(): boolean {
	try {
		const gl = document.createElement("canvas").getContext("webgl2");
		gl?.getExtension("WEBGL_lose_context")?.loseContext();
		return Boolean(gl);
	} catch {
		return false;
	}
}
