import { describe, expect, test } from "bun:test";
import type { MaintenanceOverview } from "@shared/maintenance.ts";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { maintenanceSummary } from "@/components/kelp/maintenance/stats.ts";
import { maintenanceApi } from "../../../../test/maintenance-fixtures.ts";
import { renderApp } from "../../../../test/render-app.tsx";

describe("maintenance overview page", () => {
	test("shows job types, workers, lanes and live activity", async () => {
		const { routes } = await maintenanceApi();
		const app = renderApp("/maintenance", routes);
		expect(await screen.findByText(/Running\. 6 of 7 job types are scheduled\./)).toBeTruthy();
		const vacuum = screen.getByRole("link", { name: /Volume vacuum/ });
		// Scheduled types show their next check; only manual ones carry a tag.
		expect(within(vacuum).getByText("Next check")).toBeTruthy();
		expect(vacuum.textContent).not.toContain("Manual only");
		expect(within(screen.getByRole("link", { name: /S3 lifecycle/ })).getByText(/every day/)).toBeTruthy();
		expect(screen.getByRole("link", { name: /Iceberg maintenance/ }).textContent).toContain("Manual only");
		expect(screen.getByText("worker-1.lan")).toBeTruthy();
		expect(screen.getByText("Detection slots")).toBeTruthy();
		expect(screen.getByText("lifecycle")).toBeTruthy();
		expect(screen.getByText(/Lance compact/)).toBeTruthy();
		expect(await screen.findByText("Activity")).toBeTruthy();
		await waitFor(() => expect(app.api.calls.some((c) => c.path === "/maintenance/activities")).toBe(true));

		fireEvent.click(vacuum);
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/maintenance/vacuum"));
	});

	test("explains when no worker is connected or no job types exist", async () => {
		const { routes, overview } = await maintenanceApi();
		const empty: MaintenanceOverview = { ...overview, workerCount: 0, workers: [], jobTypes: [], lanes: [] };
		renderApp("/maintenance", {
			...routes,
			"GET /maintenance/overview": empty,
			"GET /maintenance/jobs": { jobs: [] },
		});
		expect(await screen.findByText(/No workers are connected, so nothing can run/)).toBeTruthy();
		expect(screen.getByText("No job types yet")).toBeTruthy();
		expect(screen.getByText(/weed worker -admin=/)).toBeTruthy();
	});

	test("shows failures, busy schedulers, queued work and detector problems", async () => {
		const { routes, overview } = await maintenanceApi();
		const [first, ...rest] = overview.jobTypes;
		const busy: MaintenanceOverview = {
			...overview,
			scheduler: { ...overview.scheduler, phase: "detecting", currentJobType: "erasure_coding" },
			jobTypes: [
				{
					...(first as (typeof overview.jobTypes)[number]),
					lastRunStatus: "error",
					detectionInFlight: true,
					detectorAvailable: false,
				},
				...rest.map((t) => ({
					...t,
					lastRunStatus: "",
					lastDetectionSkipped: "Cooldown after last completed job",
				})),
			],
			workers: overview.workers.map((w) => ({
				...w,
				queuedByType: { vacuum: 2 },
				running: [
					{ id: "x", kind: "execution", jobType: "vacuum", state: "running", progress: 40, stage: "" },
					{ id: "y", kind: "detection", jobType: "unknown_type", state: "running", progress: 0, stage: "" },
				],
			})),
		};
		const now = new Date().toISOString();
		renderApp("/maintenance", {
			...routes,
			"GET /maintenance/overview": busy,
			"GET /maintenance/jobs": {
				jobs: [
					{ id: "a", jobType: "vacuum", state: "running", completedAt: null },
					{ id: "b", jobType: "vacuum", state: "failed", completedAt: now },
					{ id: "c", jobType: "vacuum", state: "succeeded", completedAt: now },
				],
			},
		});
		expect(await screen.findByText(/EC encoding failed on the last run/)).toBeTruthy();
		expect(screen.getByText(/Scheduler is detecting erasure coding/)).toBeTruthy();
		expect(screen.getByText("No connected worker can detect this job type.")).toBeTruthy();
		expect(screen.getAllByText(/Skipped last check: Cooldown/).length).toBe(6);
		expect(screen.getAllByText("Not yet").length).toBe(6);
		expect(screen.getByText("Running Volume vacuum")).toBeTruthy();
		expect(screen.getByText("Checking unknown_type")).toBeTruthy();
		expect(screen.getByText("2 queued on this worker")).toBeTruthy();
		const tile = (name: string) => screen.getByRole("region", { name }).textContent;
		expect(tile("Running now")).toContain("12 queued on workers");
		expect(tile("Finished, 24 hours")).toContain("1Jobs that completed");
		expect(tile("Failed, 24 hours")).toContain("1Open a job to see why");
		expect(tile("Success rate")).toContain("50%Of the last 2 finished jobs");
	});

	test("errors offer a retry", async () => {
		const { routes } = await maintenanceApi();
		let fail = true;
		renderApp("/maintenance", {
			...routes,
			"GET /maintenance/overview": () =>
				fail
					? Response.json({ error: "admin is unreachable", upstream: "admin" }, { status: 502 })
					: routes["GET /maintenance/overview"],
			"GET /maintenance/activities": () => Response.json({ error: "busy" }, { status: 503 }),
		});
		expect(await screen.findByText("SeaweedFS admin reported a problem")).toBeTruthy();
		fail = false;
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(await screen.findByText("Job types")).toBeTruthy();
		expect(await screen.findByText("busy")).toBeTruthy();
	});
});

describe("maintenanceSummary", () => {
	test("from off to healthy", async () => {
		const { overview } = await maintenanceApi();
		expect(maintenanceSummary({ ...overview, enabled: false }).tone).toBe("idle");
		expect(maintenanceSummary({ ...overview, workerCount: 0 }).tone).toBe("bad");
		expect(maintenanceSummary(overview)).toEqual({
			tone: "good",
			text: "Running. 6 of 7 job types are scheduled.",
		});
	});
});
