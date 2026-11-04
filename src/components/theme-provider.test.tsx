import { describe, expect, test } from "bun:test";
import { act, render, screen } from "@testing-library/react";
import { setMedia } from "../../test/media.ts";
import { ThemeProvider, useTheme } from "./theme-provider.tsx";

function Probe() {
	const { theme, resolvedTheme, setTheme } = useTheme();
	return (
		<div>
			<span data-testid="theme">{theme}</span>
			<span data-testid="resolved">{resolvedTheme}</span>
			<button type="button" onClick={() => setTheme("dark")}>
				dark
			</button>
			<button type="button" onClick={() => setTheme("light")}>
				light
			</button>
			<button type="button" onClick={() => setTheme("system")}>
				system
			</button>
		</div>
	);
}

const DARK = "(prefers-color-scheme: dark)";

function mockSystem(dark: boolean) {
	setMedia(DARK, dark);
	return { set: (next: boolean) => setMedia(DARK, next) };
}

describe("ThemeProvider", () => {
	test("defaults to the system theme and follows it live", () => {
		const system = mockSystem(true);
		render(
			<ThemeProvider>
				<Probe />
			</ThemeProvider>,
		);
		expect(screen.getByTestId("theme").textContent).toBe("system");
		expect(screen.getByTestId("resolved").textContent).toBe("dark");
		expect(document.documentElement.classList.contains("dark")).toBe(true);
		system.set(false);
		expect(screen.getByTestId("resolved").textContent).toBe("light");
		expect(document.documentElement.classList.contains("light")).toBe(true);
	});

	test("explicit choices override the system and persist", () => {
		mockSystem(false);
		render(
			<ThemeProvider>
				<Probe />
			</ThemeProvider>,
		);
		act(() => screen.getByText("dark").click());
		expect(screen.getByTestId("resolved").textContent).toBe("dark");
		expect(localStorage.getItem("kelp-theme")).toBe("dark");
		expect(document.documentElement.style.colorScheme).toBe("dark");
	});

	test("restores a saved choice and ignores garbage", () => {
		mockSystem(false);
		localStorage.setItem("kelp-theme", "dark");
		const { unmount } = render(
			<ThemeProvider>
				<Probe />
			</ThemeProvider>,
		);
		expect(screen.getByTestId("theme").textContent).toBe("dark");
		unmount();
		localStorage.setItem("kelp-theme", "neon");
		render(
			<ThemeProvider>
				<Probe />
			</ThemeProvider>,
		);
		expect(screen.getByTestId("theme").textContent).toBe("system");
	});

	test("useTheme outside the provider throws a helpful error", () => {
		const original = console.error;
		console.error = () => {};
		expect(() => render(<Probe />)).toThrow("useTheme must be used inside <ThemeProvider>");
		console.error = original;
	});
});
