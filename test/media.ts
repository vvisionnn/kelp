import { act } from "@testing-library/react";

/** Controls the `window.matchMedia` stub. Tests default to reduced motion so values render final. */
type Listener = (event: { matches: boolean; media: string }) => void;

const matches = new Map<string, boolean>();
const listeners = new Map<string, Set<Listener>>();

function listenersFor(query: string) {
	let set = listeners.get(query);
	if (!set) {
		set = new Set();
		listeners.set(query, set);
	}
	return set;
}

export function setMedia(query: string, value: boolean) {
	act(() => {
		matches.set(query, value);
		for (const listener of listenersFor(query)) listener({ matches: value, media: query });
	});
}

export function resetMedia() {
	matches.clear();
	listeners.clear();
	matches.set("(prefers-reduced-motion: reduce)", true);
}

export function matchMediaStub(query: string): MediaQueryList {
	const set = listenersFor(query);
	return {
		get matches() {
			return matches.get(query) ?? false;
		},
		media: query,
		onchange: null,
		addEventListener: (_: string, listener: Listener) => set.add(listener),
		removeEventListener: (_: string, listener: Listener) => set.delete(listener),
		addListener: (listener: Listener) => set.add(listener),
		removeListener: (listener: Listener) => set.delete(listener),
		dispatchEvent: () => false,
	} as unknown as MediaQueryList;
}
