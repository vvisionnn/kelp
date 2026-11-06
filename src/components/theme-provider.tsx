import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useLayoutEffect,
	useMemo,
	useState,
	useSyncExternalStore,
} from "react";
import { flushSync } from "react-dom";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "kelp-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

interface ThemeState {
	theme: Theme;
	resolvedTheme: ResolvedTheme;
	setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeState | undefined>(undefined);

function readStored(): Theme {
	const value = localStorage.getItem(STORAGE_KEY);
	return value === "light" || value === "dark" || value === "system" ? value : "system";
}

function subscribeSystem(callback: () => void) {
	const query = window.matchMedia(DARK_QUERY);
	query.addEventListener("change", callback);
	return () => query.removeEventListener("change", callback);
}

/** Applies the theme class without letting every transition animate the switch. */
function apply(resolved: ResolvedTheme) {
	const root = document.documentElement;
	const style = document.createElement("style");
	style.textContent = "*,*::before,*::after{transition:none!important}";
	document.head.appendChild(style);
	root.classList.remove("light", "dark");
	root.classList.add(resolved);
	root.style.colorScheme = resolved;
	requestAnimationFrame(() => style.remove());
}

/** Where the last press landed; theme changes start from it. */
const lastPointer = { x: window.innerWidth / 2, y: 0 };
window.addEventListener(
	"pointerdown",
	(event) => {
		lastPointer.x = event.clientX;
		lastPointer.y = event.clientY;
	},
	{ capture: true, passive: true },
);

export function ThemeProvider({ children }: { children: ReactNode }) {
	const [theme, setThemeState] = useState<Theme>(readStored);
	const systemDark = useSyncExternalStore(
		subscribeSystem,
		() => window.matchMedia(DARK_QUERY).matches,
		() => false,
	);
	const resolvedTheme: ResolvedTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme;

	useLayoutEffect(() => apply(resolvedTheme), [resolvedTheme]);

	const setTheme = useCallback((next: Theme) => {
		localStorage.setItem(STORAGE_KEY, next);
		// The new theme spreads out from where the person clicked.
		const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		if (reduced || !document.startViewTransition) return setThemeState(next);
		const root = document.documentElement;
		root.style.setProperty("--reveal-x", `${lastPointer.x}px`);
		root.style.setProperty("--reveal-y", `${lastPointer.y}px`);
		root.dataset.transition = "theme";
		document
			.startViewTransition(() => flushSync(() => setThemeState(next)))
			.finished.finally(() => delete root.dataset.transition);
	}, []);

	const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);
	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
	const context = useContext(ThemeContext);
	if (!context) throw new Error("useTheme must be used inside <ThemeProvider>");
	return context;
}
