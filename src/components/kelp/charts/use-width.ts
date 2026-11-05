import { type RefObject, useLayoutEffect, useRef, useState } from "react";

/**
 * The rendered width of an element, kept current as it resizes. Starts at `fallback` so charts
 * draw something sensible before layout (and in tests, where nothing has a size).
 */
export function useWidth<T extends HTMLElement>(fallback = 600): [RefObject<T | null>, number] {
	const ref = useRef<T>(null);
	const [width, setWidth] = useState(fallback);
	useLayoutEffect(() => {
		const element = ref.current;
		if (!element) return;
		const measure = () => {
			const next = element.getBoundingClientRect().width;
			if (next > 0) setWidth(next);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	return [ref, width];
}
