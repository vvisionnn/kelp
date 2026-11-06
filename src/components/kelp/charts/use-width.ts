import { type RefObject, useLayoutEffect, useRef, useState } from "react";

/** The last width each chart had, by page and chart, so a revisit draws at once at the right size. */
const remembered = new Map<string, number>();

/**
 * The rendered width of an element, kept current as it resizes. A chart named by `key` that was
 * shown before starts at its remembered width and lets the observer correct it, so a revisit draws
 * once without making the browser lay out the whole page while it mounts. Otherwise it starts at
 * `fallback` (before layout, and in tests) and measures right away, so nothing jumps on first sight.
 */
export function useWidth<T extends HTMLElement>(fallback = 600, key?: string): [RefObject<T | null>, number] {
	const id = key && `${window.location.pathname}|${key}`;
	const ref = useRef<T>(null);
	const [width, setWidth] = useState(() => (id && remembered.get(id)) || fallback);
	useLayoutEffect(() => {
		const element = ref.current;
		if (!element) return;
		const measure = () => {
			const next = element.getBoundingClientRect().width;
			if (next <= 0) return;
			if (id) remembered.set(id, next);
			setWidth(next);
		};
		if (!id || !remembered.has(id)) measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, [id]);
	return [ref, width];
}
