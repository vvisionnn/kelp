import { describe, expect, mock, test } from "bun:test";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";
import { setMedia } from "../../../test/media.ts";
import { settle } from "../../../test/settle.ts";
import { Button } from "../ui/button";
import { TimeChart } from "./charts/index.ts";
import { CATCH_UP_MS, resample, useArriving, useDataDuration, useTween } from "./motion.ts";
import { ChartGhost, KpiGhost, ListGhost, LoadingRegion, RingGhost, StatBandGhost } from "./skeletons.tsx";
import { useSpotlight } from "./spotlight.ts";
import { RollingValue, TextMorph } from "./text-morph.tsx";
import { allOf, Loaded, Swap } from "./transitions.tsx";

/** Moves the clock past the catch-up window, as if someone had been looking at the view a while. */
function watchAWhile() {
	const now = performance.now.bind(performance);
	performance.now = () => now() + CATCH_UP_MS + 1;
	return () => {
		performance.now = now;
	};
}

/** Runs real animations for one test; the suite otherwise lands every value at once. */
async function animated(run: () => Promise<void>) {
	setMedia("(prefers-reduced-motion: reduce)", false);
	MotionGlobalConfig.skipAnimations = false;
	try {
		await run();
	} finally {
		MotionGlobalConfig.skipAnimations = true;
	}
}

describe("Loaded", () => {
	const view = (query: Parameters<typeof Loaded<string>>[0]["query"]) => (
		<Loaded query={query} skeleton={<p>skeleton</p>}>
			{(data) => <p>{data}</p>}
		</Loaded>
	);

	test("moves from the skeleton to the content, and cached content shows at once", async () => {
		const { rerender } = render(view({ data: undefined, error: null }));
		expect(screen.getByText("skeleton").parentElement?.getAttribute("aria-busy")).toBe("true");
		rerender(view({ data: "ready", error: null }));
		await settle();
		expect(screen.getByText("ready")).toBeTruthy();
		expect(screen.queryByText("skeleton")).toBeNull();
	});

	test("shows a retryable error, and keeps data on screen when a refresh fails", async () => {
		const refetch = mock();
		const { rerender } = render(view({ data: undefined, error: new Error("offline"), refetch }));
		fireEvent.click(screen.getByRole("button", { name: /try again|retry/i }));
		expect(refetch).toHaveBeenCalled();
		rerender(view({ data: "kept", error: new Error("offline"), refetch }));
		await settle();
		expect(screen.getByText("kept")).toBeTruthy();
	});

	test("allOf waits for every query and reports the first failure", () => {
		const refetch = mock();
		const waiting = allOf({ a: { data: 1, error: null }, b: { data: undefined, error: null, refetch } });
		expect(waiting.data).toBeUndefined();
		waiting.refetch?.();
		expect(refetch).toHaveBeenCalled();
		expect(allOf({ a: { data: undefined, error: "boom" } }).error).toBe("boom");
		expect(allOf({ a: { data: 1, error: null }, b: { data: "x", error: null } }).data).toEqual({
			a: 1,
			b: "x",
		});
	});
});

test("Swap crossfades to the view its id names, hiding the leaving one from assistive tech", async () => {
	setMedia("(prefers-reduced-motion: reduce)", false);
	MotionGlobalConfig.skipAnimations = false;
	try {
		const { rerender, unmount } = render(<Swap id="a">first</Swap>);
		rerender(<Swap id="b">second</Swap>);
		// Mid-fade, both views share the cell; only the arriving one is reachable.
		const leaving = screen.getByText("first");
		expect(leaving.getAttribute("aria-hidden")).toBe("true");
		expect(leaving.hasAttribute("inert")).toBe(true);
		expect(screen.getByText("second").hasAttribute("aria-hidden")).toBe(false);
		unmount();
	} finally {
		MotionGlobalConfig.skipAnimations = true;
	}
	// With motion off the swap is immediate.
	const { rerender } = render(<Swap id="a">first</Swap>);
	rerender(<Swap id="b">second</Swap>);
	await settle();
	expect(screen.queryByText("first")).toBeNull();
});

test("the skeleton kit names what is loading", () => {
	render(
		<LoadingRegion label="Loading things">
			<KpiGhost />
			<KpiGhost trend={false} />
			<StatBandGhost count={2} />
			<ChartGhost />
			<RingGhost rows={1} />
			<ListGhost rows={1} />
		</LoadingRegion>,
	);
	const region = screen.getByRole("status", { name: "Loading things" });
	expect(region.getAttribute("aria-busy")).toBe("true");
	expect(region.querySelectorAll(".tide").length).toBeGreaterThan(10);
});

describe("text", () => {
	test("morphing text stays readable as one string", () => {
		setMedia("(prefers-reduced-motion: reduce)", false);
		const { rerender } = render(<TextMorph>Healthy</TextMorph>);
		expect(screen.getByText("Healthy").className).toContain("sr-only");
		expect(document.body.textContent).toBe("Healthy");
		rerender(<TextMorph>A long status sentence that morphs by the word</TextMorph>);
		expect(screen.getByText("A long status sentence that morphs by the word")).toBeTruthy();
		setMedia("(prefers-reduced-motion: reduce)", true);
		rerender(<TextMorph>Plain</TextMorph>);
		expect(screen.getByText("Plain").className).not.toContain("sr-only");
	});

	test("rolling values split number and unit, keep their format, and morph the rest", () => {
		setMedia("(prefers-reduced-motion: reduce)", false);
		const { rerender } = render(<RollingValue text="1,204.50 MiB" />);
		expect(screen.getByText("1,204.50")).toBeTruthy();
		expect(screen.getAllByText("MiB").length).toBeGreaterThan(0);
		rerender(<RollingValue text="Ready" />);
		expect(screen.getByText("Ready")).toBeTruthy();
		setMedia("(prefers-reduced-motion: reduce)", true);
		rerender(<RollingValue text="-3 /s" />);
		expect(screen.getByText("-3")).toBeTruthy();
	});
});

describe("tweens", () => {
	test("resample maps a series onto a new length", () => {
		expect(resample([0, 10], 3)).toEqual([0, 5, 10]);
		expect(resample([1, 2], 2)).toEqual([1, 2]);
		expect(resample([], 2)).toEqual([0, 0]);
		expect(resample([4], 2)).toEqual([4, 4]);
		expect(resample([1, 2, 3], 1)).toEqual([3]);
	});

	test("values land at once in tests and under reduced motion", () => {
		const { result } = renderHook(() => useTween([1, 2], { intro: true }));
		expect(result.current).toEqual([1, 2]);
	});

	test("values glide from where they are, and an identical refresh does nothing", async () => {
		await animated(async () => {
			const { result, rerender } = renderHook(({ to }) => useTween(to, { duration: 0.02 }), {
				initialProps: { to: [0] },
			});
			const start = result.current;
			rerender({ to: [0] });
			expect(result.current).toBe(start);
			// A refresh while the view is still catching up lands as it is.
			rerender({ to: [5] });
			expect(result.current).toEqual([5]);
			const restore = watchAWhile();
			try {
				rerender({ to: [10] });
				expect(result.current).toEqual([5]);
				await waitFor(() => expect(result.current[0]).toBeCloseTo(10));
			} finally {
				restore();
			}
		});
	});

	test("charts morph onto new samples and new series", async () => {
		await animated(async () => {
			const chart = (times: number[], values: number[], label = "reads") => (
				<TimeChart label="Traffic" times={times} series={[{ label, color: "red", values }]} />
			);
			const { container, rerender } = render(chart([0, 1000, 2000], [1, 2, 3]));
			rerender(chart([0, 1000, 2000], [1, 2, 4]));
			const restore = watchAWhile();
			rerender(chart([1000, 2000, 3000], [2, 3, 9]));
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 60));
			});
			rerender(chart([1000, 2000, 3000], [2, 3, 9], "writes"));
			await settle();
			restore();
			expect(container.querySelector("path")).toBeTruthy();
		});
	});
});

test("a pending button slides its spinner in and announces it", () => {
	const { rerender } = render(<Button pending={false}>Save</Button>);
	expect(screen.queryByRole("status")).toBeNull();
	rerender(<Button pending>Save</Button>);
	expect(screen.getByRole("status")).toBeTruthy();
	rerender(<Button>Save</Button>);
	expect(document.querySelector('[data-slot="button-pending"]')).toBeNull();
});

function Sheets() {
	useSpotlight();
	return (
		<>
			<div className="group-sheet" data-testid="a" />
			<div className="group-sheet" data-testid="b" />
		</>
	);
}

test("the spotlight follows the pointer across sheets and leaves with it", () => {
	setMedia("(hover: hover)", true);
	const { unmount } = render(<Sheets />);
	const [a, b] = [screen.getByTestId("a"), screen.getByTestId("b")];
	fireEvent.pointerMove(a, { clientX: 4, clientY: 8 });
	expect(a.style.getPropertyValue("--spot")).toBe("1");
	fireEvent.pointerMove(b, { clientX: 4, clientY: 8 });
	expect(a.style.getPropertyValue("--spot")).toBe("");
	expect(b.style.getPropertyValue("--spot")).toBe("1");
	unmount();
	expect(b.style.getPropertyValue("--spot")).toBe("");
});

function ArrivalProbe() {
	return <p>{useArriving() ? "arriving" : "already here"}</p>;
}

test("a page's content makes an entrance the first time it shows, and is simply there after that", () => {
	setMedia("(prefers-reduced-motion: reduce)", false);
	MotionGlobalConfig.skipAnimations = false;
	try {
		const view = (data: string | undefined) => (
			<Loaded query={{ data, error: null }} skeleton={<p>skeleton</p>}>
				{() => <ArrivalProbe />}
			</Loaded>
		);
		window.history.replaceState(null, "", "/first-sight");
		const first = render(view("ready"));
		expect(screen.getByText("arriving")).toBeTruthy();
		first.unmount();

		const revisit = render(view("ready"));
		expect(screen.getByText("already here")).toBeTruthy();
		revisit.unmount();

		window.history.replaceState(null, "", "/loading-again");
		const loading = render(view(undefined));
		loading.rerender(view("ready"));
		expect(screen.getByText("arriving")).toBeTruthy();
		expect(document.querySelector("[data-arrived]")).toBeTruthy();
		loading.unmount();
	} finally {
		MotionGlobalConfig.skipAnimations = true;
		window.history.replaceState(null, "", "/");
	}
});

function DurationProbe() {
	return <p>{useDataDuration(1)}</p>;
}

test("data motions run while someone watches and stay still while the view catches up", () => {
	const { rerender } = render(<DurationProbe />);
	expect(screen.getByText("0")).toBeTruthy();
	const restore = watchAWhile();
	try {
		rerender(<DurationProbe />);
		expect(screen.getByText("1")).toBeTruthy();
	} finally {
		restore();
	}
});
