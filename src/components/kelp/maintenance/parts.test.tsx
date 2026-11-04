import { describe, expect, test } from "bun:test";
import type { MaintenanceActivity } from "@shared/maintenance.ts";
import { render, screen } from "@testing-library/react";
import { renderInRouter } from "../../../../test/maintenance-render.tsx";
import { setMedia } from "../../../../test/media.ts";
import {
	ActivityFeed,
	capitalize,
	condenseActivities,
	elapsed,
	formatDuration,
	formatInterval,
	humanize,
	JobStateBadge,
	JobTypeIcon,
	KeyValues,
	OutcomeBadge,
	sourceLabel,
	stateLabel,
	ValueView,
} from "./parts.tsx";

function activity(overrides: Partial<MaintenanceActivity>): MaintenanceActivity {
	return {
		jobId: "",
		jobType: "vacuum",
		requestId: "r",
		workerId: "w",
		source: "admin_scheduler",
		stage: "",
		message: "m",
		details: {},
		occurredAt: new Date().toISOString(),
		...overrides,
	};
}

describe("formatting", () => {
	test("durations read naturally at every scale", () => {
		expect(formatDuration(0)).toBe("—");
		expect(formatDuration(Number.NaN)).toBe("—");
		expect(formatDuration(250)).toBe("250 ms");
		expect(formatDuration(4193)).toBe("4.2 s");
		expect(formatDuration(42_000)).toBe("42 s");
		expect(formatDuration(120_000)).toBe("2 min");
		expect(formatDuration(125_000)).toBe("2 min 5 s");
		expect(formatDuration(3_600_000)).toBe("1 hr");
		expect(formatDuration(5_400_000)).toBe("1 hr 30 min");
		expect(elapsed(null, "x")).toBe("—");
		expect(elapsed("2026-01-01T00:00:00Z", "2026-01-01T00:00:03Z")).toBe("3.0 s");
	});

	test("intervals", () => {
		expect(formatInterval(0)).toBe("");
		expect(formatInterval(17)).toBe("every 17 min");
		expect(formatInterval(60)).toBe("every hour");
		expect(formatInterval(180)).toBe("every 3 hr");
		expect(formatInterval(1440)).toBe("every day");
		expect(formatInterval(2880)).toBe("every 2 days");
	});

	test("names", () => {
		expect(humanize("erasure_coding")).toBe("Erasure coding");
		expect(humanize("")).toBe("Unknown");
		expect(capitalize("job assigned")).toBe("Job assigned");
		expect(capitalize("")).toBe("");
		expect(sourceLabel("activity_source_executor")).toBe("Worker");
		expect(sourceLabel("admin_dispatch")).toBe("Dispatcher");
		expect(sourceLabel("something_new")).toBe("Something new");
		expect(stateLabel("pending")).toBe("Queued");
	});

	test("progress ticks collapse to the newest per job", () => {
		const list = [
			activity({ jobId: "a", message: "vacuum progress 90%" }),
			activity({ jobId: "a", message: "vacuum progress 50%" }),
			activity({ jobId: "a", message: "vacuum completed" }),
			activity({ jobId: "", message: "detection progress" }),
		];
		expect(condenseActivities(list).map((a) => a.message)).toEqual([
			"vacuum progress 90%",
			"vacuum completed",
			"detection progress",
		]);
	});
});

describe("badges and icons", () => {
	test("states, outcomes and icons", () => {
		const { container } = render(
			<>
				<JobStateBadge state="running" progress={42} />
				<JobStateBadge state="running" progress={0} />
				<JobStateBadge state="failed" />
				<OutcomeBadge outcome="success" />
				<OutcomeBadge outcome="error" />
				<OutcomeBadge outcome="" />
				<OutcomeBadge outcome="skipped" />
				<JobTypeIcon jobType="vacuum" />
				<JobTypeIcon jobType="brand_new" />
			</>,
		);
		expect(screen.getByText("42%")).toBeTruthy();
		expect(screen.getAllByText("Running")).toHaveLength(2);
		expect(screen.getAllByText("Failed")).toHaveLength(2);
		expect(screen.getByText("Succeeded")).toBeTruthy();
		expect(screen.getByText("Unknown")).toBeTruthy();
		expect(screen.getByText("Skipped")).toBeTruthy();
		expect(container.querySelectorAll("svg").length).toBe(2);
	});
});

describe("values", () => {
	test("every value shape renders", () => {
		render(
			<KeyValues
				values={{
					empty: "",
					missing: null,
					flag: true,
					off: false,
					count: 1234,
					text: "short",
					script: "line one\nline two",
					list: ["a", 2],
					nothing: [],
					nested: { inner: "x" },
				}}
			/>,
		);
		expect(screen.getAllByText("—")).toHaveLength(2);
		expect(screen.getByText("Yes")).toBeTruthy();
		expect(screen.getByText("No")).toBeTruthy();
		expect(screen.getByText("1,234")).toBeTruthy();
		expect(screen.getByText(/line one/).tagName).toBe("PRE");
		expect(screen.getByText("None")).toBeTruthy();
		expect(screen.getByText("Inner")).toBeTruthy();
	});

	test("empty maps explain themselves", () => {
		render(<KeyValues values={{}} empty="No outputs." />);
		expect(screen.getByText("No outputs.")).toBeTruthy();
		render(<ValueView value={"x".repeat(100)} />);
		expect(screen.getByText("x".repeat(100)).tagName).toBe("PRE");
	});
});

describe("activity feed", () => {
	test("shows events, links jobs and names job types", async () => {
		await renderInRouter(
			<ActivityFeed
				names={{ vacuum: "Volume vacuum" }}
				activities={[
					activity({ jobId: "job-1", message: "job assigned", source: "admin_dispatch" }),
					activity({ message: "detection completed", occurredAt: null, requestId: "r2" }),
				]}
			/>,
		);
		expect(screen.getByRole("link", { name: "Job assigned" }).getAttribute("href")).toBe(
			"/maintenance/jobs/job-1",
		);
		expect(screen.getByText("Detection completed")).toBeTruthy();
		expect(screen.getAllByText(/Volume vacuum, /)).toHaveLength(2);
		expect(screen.getByText("never")).toBeTruthy();
	});

	test("animates when motion is allowed, and has an empty state", async () => {
		setMedia("(prefers-reduced-motion: reduce)", false);
		await renderInRouter(<ActivityFeed activities={[activity({})]} showJobType={false} />);
		expect(screen.getByText("M")).toBeTruthy();
		expect(screen.queryByText(/Vacuum/)).toBeNull();
		render(<ActivityFeed activities={[]} />);
		expect(screen.getByText("No maintenance activity yet.")).toBeTruthy();
	});
});
