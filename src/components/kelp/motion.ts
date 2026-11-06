import { animate, MotionGlobalConfig } from "motion/react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";

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

/**
 * True inside content that is arriving: data that just replaced its skeleton. Bars grow, lines draw
 * and rows rise only then. Content that was already there, cached on a revisit or shown on a tab
 * switch, appears as it is, so an animation plays once, when the data first appears.
 */
export const ArrivalContext = createContext(false);

/** How long after data lands its parts still count as arriving: long enough for nested charts to mount. */
export const ARRIVAL_MS = 1200;

/** Whether this component mounted as part of an arrival. Read once, at mount. */
export function useArriving(): boolean {
	const instant = useInstantMotion();
	const arriving = useContext(ArrivalContext);
	return useState(arriving && !instant)[0];
}

/**
 * How long after a view appears its data is still catching up. Opening a page from cache usually
 * brings a refresh a moment later with slightly newer numbers; those land as they are, because
 * nobody has read the old ones yet. Changes after this move, because someone is watching.
 */
export const CATCH_UP_MS = 1500;

/** Whether the person has had the view in front of them long enough to see a change happen. */
export function useWatching(): () => boolean {
	const since = useRef(0);
	useEffect(() => {
		since.current = performance.now();
	}, []);
	return useCallback(() => since.current > 0 && performance.now() - since.current > CATCH_UP_MS, []);
}

/**
 * The duration for a data-driven motion this render: the full `duration` when the data arrives or
 * changes in front of someone, 0 while the view is still catching up.
 */
export function useDataDuration(duration: number = SPEED.data): number {
	const arriving = useArriving();
	const watching = useWatching();
	return arriving || watching() ? duration : 0;
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
 * Numbers that glide to their new values instead of jumping. `intro` starts them from zero when
 * they arrive (see `ArrivalContext`), for bars and rings that grow in. Identical refreshes do
 * nothing, and changes while the view is still catching up land at once (see `CATCH_UP_MS`).
 */
export function useTween(
	target: number[],
	{ intro = false, duration = SPEED.data as number } = {},
): number[] {
	const instant = useInstantMotion();
	const arriving = useArriving();
	const [shown, setShown] = useState(() =>
		intro && arriving ? new Array<number>(target.length).fill(0) : target,
	);
	const current = useRef(shown);
	const growing = useRef(intro && arriving);
	const watching = useWatching();
	const key = target.join(",");
	// biome-ignore lint/correctness/useExhaustiveDependencies: `key` is `target` by value; a new array with the same numbers must not restart the tween.
	useEffect(() => {
		if (instant) return;
		const from = resample(current.current, target.length);
		if (from.every((value, i) => value === target[i])) return;
		const grow = growing.current;
		growing.current = false;
		if (!grow && !watching()) {
			current.current = target;
			setShown(target);
			return;
		}
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
