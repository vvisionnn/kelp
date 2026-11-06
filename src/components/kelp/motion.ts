import { animate, MotionGlobalConfig } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/** Kelp's motion vocabulary. Everything that moves uses these, so the app feels like one thing. */
export const EASE = [0.22, 1, 0.36, 1] as const;
export const SPEED = { fast: 0.16, base: 0.28, slow: 0.45, data: 0.7 } as const;
export const SPRING = { type: "spring", stiffness: 500, damping: 40 } as const;

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

/** Reduced motion, or tests, where every value lands at once. */
export function useInstantMotion(): boolean {
	return usePrefersReducedMotion() || MotionGlobalConfig.skipAnimations === true;
}

/** Linear interpolation of `from` onto `length` points, so series of different sizes can morph. */
export function resample(from: number[], length: number): number[] {
	if (from.length === length) return from;
	if (from.length === 0) return new Array<number>(length).fill(0);
	if (length < 2 || from.length === 1) return new Array<number>(length).fill(from.at(-1) as number);
	return Array.from({ length }, (_, i) => {
		const at = (i / (length - 1)) * (from.length - 1);
		const low = Math.floor(at);
		const high = Math.min(from.length - 1, low + 1);
		return (from[low] as number) + ((from[high] as number) - (from[low] as number)) * (at - low);
	});
}

/**
 * Numbers that glide to their new values instead of jumping. `intro` starts them from zero, for
 * bars and rings that grow in. Identical refreshes do nothing, so a refetch with no news stays still.
 */
export function useTween(
	target: number[],
	{ intro = false, duration = SPEED.data as number } = {},
): number[] {
	const instant = useInstantMotion();
	const [shown, setShown] = useState(() =>
		intro && !instant ? new Array<number>(target.length).fill(0) : target,
	);
	const current = useRef(shown);
	const key = target.join(",");
	// biome-ignore lint/correctness/useExhaustiveDependencies: `key` is `target` by value; a new array with the same numbers must not restart the tween.
	useEffect(() => {
		if (instant) return;
		const from = resample(current.current, target.length);
		if (from.every((value, i) => value === target[i])) return;
		const controls = animate(0, 1, {
			duration,
			ease: EASE,
			onUpdate: (p) => {
				current.current = target.map((to, i) => (from[i] as number) + (to - (from[i] as number)) * p);
				setShown(current.current);
			},
		});
		return () => controls.stop();
	}, [key, instant, duration]);
	if (instant) return target;
	return shown.length === target.length ? shown : resample(shown, target.length);
}
