import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { ApiError } from "@/lib/api.ts";
import { setMedia } from "../../../test/media.ts";
import { settle } from "../../../test/settle.ts";
import { ThemeProvider } from "../theme-provider.tsx";
import { AmbientRays } from "./ambient.tsx";
import { KelpMark, Wordmark } from "./brand.tsx";
import { canUseWebGL2 } from "./motion.ts";
import {
	CapacityBar,
	EmptyState,
	ErrorState,
	Metric,
	PageHeader,
	Panel,
	Reveal,
	StatTile,
	StatusDot,
} from "./page.tsx";

describe("page primitives", () => {
	test("header, panel and empty state render their content", () => {
		render(
			<>
				<PageHeader title="Buckets" description="All of them" actions={<button type="button">New</button>} />
				<Panel title="Panel" description="desc" actions={<span>act</span>}>
					body
				</Panel>
				<Panel>bare</Panel>
				<EmptyState
					icon={<span />}
					title="Empty"
					description="Add one"
					action={<button type="button">Add</button>}
				/>
				<Reveal delay={0.1}>revealed</Reveal>
			</>,
		);
		for (const text of [
			"Buckets",
			"All of them",
			"New",
			"Panel",
			"desc",
			"act",
			"body",
			"bare",
			"Empty",
			"Add one",
			"Add",
			"revealed",
		]) {
			expect(screen.getByText(text)).toBeTruthy();
		}
	});

	test("capacity bar turns amber then red, always with a readable value", () => {
		render(
			<>
				<CapacityBar used={10} total={100} />
				<CapacityBar used={85} total={100} />
				<CapacityBar used={99} total={100} />
				<CapacityBar used={1} total={0} />
			</>,
		);
		const meters = screen.getAllByRole("meter");
		expect(meters.map((m) => m.getAttribute("aria-valuenow"))).toEqual(["10", "85", "99", "0"]);
		expect(meters[0]?.firstElementChild?.className).toContain("bg-primary");
		expect(meters[1]?.firstElementChild?.className).toContain("bg-warning");
		expect(meters[2]?.firstElementChild?.className).toContain("bg-destructive");
	});

	test("status dots carry a text label", () => {
		render(
			<>
				<StatusDot tone="good" label="Up" />
				<StatusDot tone="warn" label="Slow" />
				<StatusDot tone="bad" label="Down" />
				<StatusDot tone="idle" label="Idle" />
			</>,
		);
		for (const text of ["Up", "Slow", "Down", "Idle"]) expect(screen.getByText(text)).toBeTruthy();
	});

	test("errors name the failing SeaweedFS component", () => {
		const retry = mock(() => {});
		const { rerender } = render(
			<ErrorState error={new ApiError(502, "filer is unreachable", "filer")} onRetry={retry} />,
		);
		expect(screen.getByText("SeaweedFS filer reported a problem")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(retry).toHaveBeenCalled();
		rerender(<ErrorState error="weird" />);
		expect(screen.getByText("Could not load this data")).toBeTruthy();
		expect(screen.getByText("Something went wrong")).toBeTruthy();
		expect(screen.queryByRole("button")).toBeNull();
	});

	test("metrics count up unless motion is reduced or a formatter is given", async () => {
		const { rerender } = render(<StatTile label="Files" value={1234} hint="hint" icon={<span />} />);
		expect(screen.getByText("1,234")).toBeTruthy();
		rerender(<StatTile label="Size" value={2048} format={(n) => `${n} B`} />);
		// The unit is set apart so it can sit lighter than the number.
		expect(screen.getByText("B").parentElement?.textContent).toBe("2048B");
		rerender(<StatTile label="State" value={1} format={() => "Ready"} />);
		expect(screen.getByText("Ready")).toBeTruthy();
		setMedia("(prefers-reduced-motion: reduce)", false);
		rerender(<Metric value={5} />);
		await act(async () => {});
		expect(document.body.textContent).toMatch(/\d/);
	});

	test("brand marks render", () => {
		const { container } = render(
			<>
				<KelpMark className="size-4" />
				<Wordmark />
			</>,
		);
		expect(container.querySelectorAll("svg").length).toBeGreaterThan(0);
		expect(screen.getByText("Kelp")).toBeTruthy();
	});
});

describe("ambient threads", () => {
	const getContext = HTMLCanvasElement.prototype.getContext;
	afterEach(() => {
		HTMLCanvasElement.prototype.getContext = getContext;
	});

	function fakeWebGL2() {
		const loseContext = mock(() => {});
		HTMLCanvasElement.prototype.getContext = (() => ({ getExtension: () => ({ loseContext }) })) as never;
		return loseContext;
	}

	test("stays out of the way without WebGL2 or with reduced motion", () => {
		expect(canUseWebGL2()).toBe(false);
		const { container } = render(<AmbientRays color="#8fd0ff" light={false} />);
		expect(container.innerHTML).toBe("");
		fakeWebGL2();
		const reduced = render(<AmbientRays color="#8fd0ff" light={false} />);
		expect(reduced.container.innerHTML).toBe("");
	});

	test("probing releases its context and survives a throwing canvas", () => {
		const loseContext = fakeWebGL2();
		expect(canUseWebGL2()).toBe(true);
		expect(loseContext).toHaveBeenCalled();
		HTMLCanvasElement.prototype.getContext = () => {
			throw new Error("no gpu");
		};
		expect(canUseWebGL2()).toBe(false);
	});

	test("renders the effect when allowed, unmounts in background tabs, and fails quietly", async () => {
		fakeWebGL2();
		setMedia("(prefers-reduced-motion: reduce)", false);
		const original = console.error;
		console.error = () => {};
		const { container } = render(<AmbientRays color="#8fd0ff" light={false} className="rays" />);
		Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
		document.dispatchEvent(new Event("visibilitychange"));
		expect(container.querySelector(".rays")).toBeNull();
		Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
		document.dispatchEvent(new Event("visibilitychange"));
		await settle(100);
		console.error = original;
		// The fake context cannot run shaders, so the boundary swallows the failure.
		expect(container.innerHTML).toBe("");
	});
});

describe("server rendering", () => {
	test("motion and theme hooks have safe server snapshots", () => {
		const html = renderToString(
			<ThemeProvider>
				<Reveal>ssr</Reveal>
			</ThemeProvider>,
		);
		expect(html).toContain("ssr");
	});
});
