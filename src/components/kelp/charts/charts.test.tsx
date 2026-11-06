import { describe, expect, test } from "bun:test";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { makeTelemetry } from "../../../../test/telemetry-fixtures.ts";
import {
	BarList,
	Columns,
	clock,
	clockSeconds,
	compact,
	dataColor,
	hasSeries,
	Kpi,
	latencySeries,
	latest,
	millis,
	perSecond,
	Ring,
	robustTop,
	Sparkline,
	splitUnit,
	TimeChart,
	trafficByType,
} from "./index.ts";

const times = [0, 15_000, 30_000, 45_000].map((t) => Date.parse("2026-11-05T12:00:00Z") + t);

describe("chart formatters", () => {
	test("compact, rates, durations and clock times", () => {
		expect([
			compact(950),
			compact(1234),
			compact(34_000),
			compact(1.5e6),
			compact(2e9),
			compact(0.25),
			compact(Number.NaN),
		]).toEqual(["950", "1.2K", "34K", "1.5M", "2B", "0.3", "–"]);
		expect(perSecond(12.4)).toBe("12.4/s");
		expect([millis(4.25), millis(320), millis(1400)]).toEqual(["4.3 ms", "320 ms", "1.4 s"]);
		expect(clock(times[0] as number)).toMatch(/^\d\d:\d\d$/);
		expect(clock(times[0] as number, true)).toMatch(/^Nov 5 \d\d:\d\d$/);
		expect(clockSeconds(times[1] as number)).toMatch(/^\d\d:\d\d:15$/);
	});

	test("units split away from numbers for stat tiles", () => {
		expect(splitUnit("42.7 MiB")).toEqual({ value: "42.7", unit: "MiB" });
		expect(splitUnit("57")).toEqual({ value: "57" });
		expect(splitUnit("Ready")).toEqual({ value: "Ready" });
	});
});

describe("telemetry helpers", () => {
	test("traffic folds request types past the fourth into Other and keeps colors in order", () => {
		const telemetry = makeTelemetry(4);
		const series = trafficByType(telemetry.points, (p) => p.s3);
		expect(series.map((s) => s.label)).toEqual(["GET", "PUT", "LIST", "HEAD", "Other"]);
		expect(series.map((s) => s.color)).toEqual([1, 2, 3, 4, 5].map((n) => `var(--data-${n})`));
		expect(series[4]?.values[0]).toBeGreaterThan(0);
		expect(latencySeries(telemetry.points, (p) => p.s3).map((s) => s.label)).toEqual(["p50", "p95", "p99"]);
		expect(dataColor(9)).toBe("var(--data-5)");
	});

	test("latest skips gaps and hasSeries needs two points", () => {
		expect(latest([1, 2, null])).toBe(2);
		expect(latest([null])).toBeNull();
		expect(hasSeries(makeTelemetry(1))).toBe(false);
		expect(hasSeries(makeTelemetry(3))).toBe(true);
		expect(hasSeries(undefined)).toBe(false);
	});
});

describe("time chart", () => {
	const series = [
		{ label: "Reads", color: "var(--data-1)", values: [1, 2, null, 4] },
		{ label: "Writes", color: "var(--data-2)", values: [0, 1, 1, 2] },
	];

	test("waits for two points before drawing", () => {
		render(<TimeChart times={[1]} series={series} label="Traffic" empty="Collecting" />);
		expect(screen.getByText("Collecting")).toBeTruthy();
	});

	test("shows every series at the hovered time and a table of all points", () => {
		const { container } = render(<TimeChart times={times} series={series} mode="area" label="Traffic" />);
		const chart = screen.getByRole("img", { name: "Traffic" });
		chart.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 200 }) as DOMRect;
		fireEvent.pointerMove(chart, { clientX: 590 });
		const tooltip = screen.getByRole("status");
		expect(within(tooltip).getByText("Reads")).toBeTruthy();
		expect(within(tooltip).getByText("4")).toBeTruthy();
		fireEvent.pointerLeave(chart);
		expect(screen.queryByRole("status")).toBeNull();
		expect(container.querySelectorAll("table tbody tr")).toHaveLength(4);
		expect(screen.getByText("Writes", { selector: "li" })).toBeTruthy();
	});

	test("the keyboard walks through samples, and gaps read as a dash", () => {
		render(<TimeChart times={times} series={series} mode="stacked" label="Traffic" />);
		const chart = screen.getByRole("img", { name: "Traffic" });
		act(() => chart.focus());
		fireEvent.focus(chart);
		fireEvent.keyDown(chart, { key: "ArrowLeft" });
		expect(within(screen.getByRole("status")).getAllByText("–").length).toBeGreaterThan(0);
		fireEvent.keyDown(chart, { key: "ArrowRight" });
		fireEvent.keyDown(chart, { key: "Escape" });
		expect(screen.queryByRole("status")).toBeNull();
		fireEvent.keyDown(chart, { key: "ArrowRight" });
		fireEvent.blur(chart);
		expect(screen.queryByRole("status")).toBeNull();
	});
});

describe("robust axis", () => {
	test("a lone spike is cut off so the typical range stays readable", () => {
		const calm = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2];
		expect(robustTop([...calm, 400])).toEqual({ top: 3, clipped: true });
		expect(robustTop(calm)).toEqual({ top: 2, clipped: false });
		expect(robustTop([1, 900])).toEqual({ top: 900, clipped: false });
	});

	test("a clipped chart says so", () => {
		const t = Array.from({ length: 12 }, (_, i) => i * 15_000);
		render(
			<TimeChart
				times={t}
				series={[{ label: "Latency", color: "red", values: t.map((_, i) => (i === 0 ? 900 : 3)) }]}
				label="Latency"
			/>,
		);
		expect(screen.getByText(/are cut off/)).toBeTruthy();
	});
});

describe("other charts", () => {
	test("bar lists rank items and say when there is nothing", () => {
		const { rerender } = render(
			<BarList
				label="Buckets"
				items={[
					{ key: "a", label: "a", value: 10, display: "10" },
					{ key: "b", label: "b", value: 0, display: "0", extra: <span>x</span> },
				]}
			/>,
		);
		expect(within(screen.getByRole("list", { name: "Buckets" })).getAllByRole("listitem")).toHaveLength(2);
		rerender(<BarList label="Buckets" items={[]} empty="Nothing yet" />);
		expect(screen.getByText("Nothing yet")).toBeTruthy();
	});

	test("ring slices show their value in the center on hover and focus", () => {
		render(
			<Ring
				label="Capacity"
				center={<span>75%</span>}
				slices={[
					{ label: "Used", value: 3, color: "red", display: "3 GiB" },
					{ label: "Free", value: 1, color: "gray", display: "1 GiB" },
					{ label: "Empty", value: 0, color: "blue", display: "0 B" },
				]}
			/>,
		);
		const used = screen.getByRole("button", { name: "Used: 3 GiB" });
		fireEvent.pointerEnter(used);
		expect(screen.getAllByText("3 GiB").length).toBe(2);
		fireEvent.pointerLeave(used);
		fireEvent.focus(screen.getByRole("button", { name: "Free: 1 GiB" }));
		expect(screen.getAllByText("1 GiB").length).toBe(2);
		fireEvent.blur(screen.getByRole("button", { name: "Free: 1 GiB" }));
		expect(screen.getByText("75%")).toBeTruthy();
	});

	test("columns reveal their value on hover and focus", () => {
		render(
			<Columns
				label="Sizes"
				columns={[
					{ label: "small", value: 4 },
					{ label: "large", value: 0 },
				]}
			/>,
		);
		const small = screen.getByRole("button", { name: "small: 4" });
		fireEvent.pointerEnter(small);
		expect(screen.getByText("4")).toBeTruthy();
		fireEvent.pointerLeave(small);
		fireEvent.focus(screen.getByRole("button", { name: "large: 0" }));
		fireEvent.blur(screen.getByRole("button", { name: "large: 0" }));
		expect(screen.queryByText("4")).toBeNull();
	});

	test("sparklines draw a trend and stay empty with too few points; stat tiles show tone", () => {
		const { container, rerender } = render(<Sparkline label="trend" values={[1, null, 3]} />);
		expect(container.querySelectorAll("path")).toHaveLength(2);
		rerender(<Sparkline label="trend" values={[1]} />);
		expect(container.querySelectorAll("path")).toHaveLength(0);
		rerender(<Kpi label="Errors" value="3" unit="/s" hint="Failing" tone="bad" trend={[1, 2, 3]} />);
		expect(screen.getByRole("region", { name: "Errors" }).textContent).toContain("Failing");
		rerender(<Kpi label="Users" value={31} />);
		expect(screen.getByRole("region", { name: "Users" }).textContent).toContain("31");
		rerender(<Kpi label="Disk" value="85" unit="%" tone="warn" />);
		expect(screen.getByText("85").closest(".text-warning")).toBeTruthy();
	});
});
