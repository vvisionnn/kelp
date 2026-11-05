import { describe, expect, test } from "bun:test";
import type { JobRun, MaintenanceActivity, MaintenanceJob } from "@shared/maintenance.ts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { StackedColumns } from "../charts/stacked-columns.tsx";
import {
	ChecksChart,
	DurationCompare,
	lastDay,
	OutcomesChart,
	StageTimes,
	stageTimes,
	WorkerTime,
} from "./insights.tsx";
import {
	hourly,
	isCheck,
	jobDuration,
	median,
	proposalsOf,
	runStats,
	successRate,
	timeByType,
	waitProgress,
} from "./stats.ts";

const NOW = Date.parse("2026-11-05T12:30:00Z");
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

function job(partial: Partial<MaintenanceJob>): MaintenanceJob {
	return {
		id: "j",
		jobType: "vacuum",
		state: "succeeded",
		progress: 100,
		stage: "",
		message: "",
		summary: "",
		detail: "",
		workerId: "",
		requestId: "",
		attempt: 1,
		createdAt: iso(-60_000),
		updatedAt: null,
		completedAt: iso(0),
		errorMessage: "",
		resultSummary: "",
		...partial,
	};
}

function activity(partial: Partial<MaintenanceActivity>): MaintenanceActivity {
	return {
		jobId: "",
		jobType: "vacuum",
		requestId: "",
		workerId: "",
		source: "admin_scheduler",
		stage: "detected",
		message: "scheduled detection completed: 0 proposal(s)",
		details: {},
		occurredAt: iso(-1000),
		...partial,
	};
}

describe("maintenance stats", () => {
	test("hourly buckets count checks, proposals and finished jobs by outcome", () => {
		const buckets = hourly(
			[
				job({ state: "succeeded" }),
				job({ state: "failed" }),
				job({ state: "canceled" }),
				job({ state: "running", completedAt: null }),
				job({ completedAt: iso(-48 * 3_600_000) }),
			],
			[
				activity({}),
				activity({ message: "scheduled detection completed: 3 proposal(s)" }),
				activity({ stage: "detecting" }),
				activity({ occurredAt: iso(-48 * 3_600_000) }),
			],
			NOW,
			24,
		);
		expect(buckets).toHaveLength(24);
		const current = buckets.at(-1);
		expect(current).toMatchObject({
			checks: 2,
			found: 1,
			proposals: 3,
			succeeded: 1,
			failed: 1,
			canceled: 1,
		});
		expect(lastDay([], [], NOW)).toHaveLength(24);
	});

	test("checks, proposals, durations, medians and success rates", () => {
		expect(isCheck(activity({}))).toBe(true);
		expect(isCheck(activity({ source: "detector" }))).toBe(false);
		expect(proposalsOf(activity({ message: "no number" }))).toBe(0);
		expect(jobDuration(job({}))).toBe(60_000);
		expect(jobDuration(job({ completedAt: null }))).toBeNull();
		expect(median([])).toBeNull();
		expect(median([3, 1, 2])).toBe(2);
		expect(median([1, 2, 3, 4])).toBe(2.5);
		expect(successRate([{ state: "running" }])).toBeNull();
		expect(successRate([{ state: "succeeded" }, { state: "failed" }])).toBe(0.5);
		const times = timeByType([
			job({}),
			job({ jobType: "erasure_coding", createdAt: iso(-300_000) }),
			job({ completedAt: null }),
		]);
		expect(times.map((t) => t.jobType)).toEqual(["erasure_coding", "vacuum"]);
	});

	test("run stats and the wait for the next check", () => {
		const runs = [
			{ outcome: "success", durationMs: 1000 },
			{ outcome: "error", durationMs: 3000 },
			{ outcome: "skipped", durationMs: 0 },
		] as JobRun[];
		expect(runStats(runs)).toEqual({
			runs: 3,
			succeeded: 1,
			failed: 1,
			successRate: 0.5,
			medianMs: 2000,
			longestMs: 3000,
		});
		expect(runStats([])).toMatchObject({ successRate: null, medianMs: null, longestMs: null });
		expect(waitProgress(iso(-60_000), iso(60_000), NOW)).toBe(0.5);
		expect(waitProgress(null, iso(60_000), NOW)).toBeNull();
		expect(waitProgress(iso(0), iso(-1), NOW)).toBeNull();
	});
});

describe("maintenance charts", () => {
	test("stacked columns list every part on hover and focus, with a legend and a table", () => {
		const { container } = render(
			<StackedColumns
				label="Outcomes"
				series={[
					{ key: "a", label: "Succeeded", color: "green" },
					{ key: "b", label: "Failed", color: "red" },
				]}
				columns={[
					{ label: "10:00", values: { a: 2, b: 1 } },
					{ key: "x", label: "11:00", values: { a: 0, b: 0 } },
				]}
			/>,
		);
		const first = screen.getByRole("button", { name: "10:00: Succeeded 2, Failed 1" });
		fireEvent.pointerEnter(first);
		expect(within(screen.getByRole("status")).getByText("Failed")).toBeTruthy();
		fireEvent.pointerLeave(first);
		expect(screen.queryByRole("status")).toBeNull();
		const second = screen.getByRole("button", { name: "11:00: none" });
		fireEvent.focus(second);
		expect(screen.getByRole("status")).toBeTruthy();
		fireEvent.blur(second);
		expect(screen.getAllByText("Succeeded").length).toBeGreaterThan(0);
		expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
	});

	test("charts say when there is nothing to draw", () => {
		const empty = lastDay([], [], NOW);
		render(
			<>
				<OutcomesChart buckets={empty} />
				<ChecksChart buckets={empty} height={120} />
				<WorkerTime jobs={[]} names={{}} />
			</>,
		);
		expect(screen.getByText("No job has finished in the last 24 hours.")).toBeTruthy();
		expect(screen.getByText("No scheduled check has run in the last 24 hours.")).toBeTruthy();
		expect(screen.getByText(/no time to account for/)).toBeTruthy();
	});

	test("worker time names job types and shows how long each took", () => {
		render(
			<WorkerTime jobs={[job({}), job({ jobType: "admin_script" })]} names={{ vacuum: "Volume vacuum" }} />,
		);
		expect(screen.getByText("Volume vacuum")).toBeTruthy();
		expect(screen.getByText("Admin script")).toBeTruthy();
	});

	test("a run's duration is compared with the median only when there is history", () => {
		const { rerender, container } = render(<DurationCompare ms={2000} medianMs={1000} runs={5} />);
		expect(screen.getByText("2.0× longer than usual.")).toBeTruthy();
		rerender(<DurationCompare ms={500} medianMs={1000} runs={5} />);
		expect(screen.getByText("2.0× faster than usual.")).toBeTruthy();
		rerender(<DurationCompare ms={1000} medianMs={1020} runs={5} />);
		expect(screen.getByText("About as long as usual.")).toBeTruthy();
		rerender(<DurationCompare ms={1000} medianMs={null} runs={0} />);
		expect(container.textContent).toBe("");
	});

	test("stage times credit each gap to the earlier event, longest first", () => {
		const steps = [
			activity({ message: "queued", occurredAt: iso(0) }),
			activity({ message: "running", occurredAt: iso(5000) }),
			activity({ message: "done", occurredAt: iso(6000) }),
			activity({ message: "no time", occurredAt: null }),
		];
		expect(stageTimes(steps)).toEqual([
			{ label: "queued", ms: 5000 },
			{ label: "running", ms: 1000 },
		]);
		render(<StageTimes steps={steps} />);
		expect(screen.getByText("Queued")).toBeTruthy();
		expect(screen.getByText("5.0 s")).toBeTruthy();
	});
});
