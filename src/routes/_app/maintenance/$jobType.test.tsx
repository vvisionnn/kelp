import { describe, expect, test } from "bun:test";
import type { DetectionResult } from "@shared/maintenance.ts";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { detectionMessage } from "@/components/kelp/maintenance/stats.ts";
import { maintenanceApi } from "../../../../test/maintenance-fixtures.ts";
import { type ApiCall, renderApp, viewerUser } from "../../../../test/render-app.tsx";
import { settle } from "../../../../test/settle.ts";

describe("job type page", () => {
	test("shows the settings form and saves changes", async () => {
		const { routes, vacuumConfig } = await maintenanceApi();
		const app = renderApp("/maintenance/vacuum", {
			...routes,
			"PUT /maintenance/job-types/vacuum/config": (call: ApiCall) => ({
				...vacuumConfig,
				worker: { ...vacuumConfig.worker, ...(call.body as { worker: object }).worker },
				updatedAt: new Date().toISOString(),
			}),
		});
		expect(await screen.findByRole("heading", { name: "Volume vacuum" })).toBeTruthy();
		expect(screen.getByText(/Saved .* by admin/)).toBeTruthy();
		fireEvent.change(screen.getByLabelText("Garbage threshold"), { target: { value: "0.5" } });
		fireEvent.click(await screen.findByRole("button", { name: "Save changes" }));
		expect(await screen.findByText("Volume vacuum settings saved")).toBeTruthy();
		expect(app.api.last("PUT", "/maintenance/job-types/vacuum/config")?.body).toEqual({
			worker: { garbage_threshold: 0.5 },
		});
	});

	test("check for work opens the proposals and can run them", async () => {
		const { routes, detection, runResult } = await maintenanceApi();
		const app = renderApp("/maintenance/vacuum", {
			...routes,
			"POST /maintenance/job-types/vacuum/detect": detection,
			"POST /maintenance/job-types/vacuum/run": runResult,
		});
		fireEvent.click(await screen.findByRole("button", { name: "Check for work" }));
		const sheet = await screen.findByRole("dialog");
		expect(within(sheet).getByText("Proposed jobs")).toBeTruthy();
		expect(within(sheet).getAllByText("high").length).toBe(detection.totalProposals);
		expect(within(sheet).getByText("How the worker decided")).toBeTruthy();
		expect(within(sheet).queryByText(/Task type/)).toBeNull();
		fireEvent.click(within(sheet).getByRole("button", { name: "Run these jobs" }));
		expect(await screen.findByText(/Volume vacuum ran \d+ jobs: \d+ succeeded, 0 failed/)).toBeTruthy();
		expect(app.api.last("POST", "/maintenance/job-types/vacuum/run")).toBeTruthy();
		await settle(300);
		expect(screen.queryByText("Proposed jobs")).toBeNull();
	});

	test("an empty check explains why and closes", async () => {
		const { routes, detection } = await maintenanceApi();
		const nothing: DetectionResult = {
			...detection,
			totalProposals: 0,
			proposals: [],
			skippedReason: "Cooldown after last completed job",
			eligibleAfter: new Date(Date.now() + 600_000).toISOString(),
			error: "worker timed out",
		};
		renderApp("/maintenance/vacuum", { ...routes, "POST /maintenance/job-types/vacuum/detect": nothing });
		fireEvent.click(await screen.findByRole("button", { name: "Check for work" }));
		const sheet = await screen.findByRole("dialog");
		expect(within(sheet).getByText("Nothing needs doing right now.")).toBeTruthy();
		expect(
			within(sheet).getByText(/Skipped: Cooldown after last completed job Eligible again in 10 min\./),
		).toBeTruthy();
		expect(within(sheet).getByText("worker timed out")).toBeTruthy();
		expect(within(sheet).queryByRole("button", { name: "Run these jobs" })).toBeNull();
		fireEvent.click(within(sheet).getByRole("button", { name: "Close" }));
		await settle(300);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	test("run now asks first and reports when there was nothing to do", async () => {
		const { routes, runResult } = await maintenanceApi();
		renderApp("/maintenance/vacuum", {
			...routes,
			"POST /maintenance/job-types/vacuum/run": { ...runResult, executed: 0 },
		});
		fireEvent.click(await screen.findByRole("button", { name: "Run now" }));
		const dialog = await screen.findByRole("alertdialog");
		fireEvent.click(within(dialog).getByRole("button", { name: "Run now" }));
		expect(await screen.findByText("Volume vacuum found nothing to run")).toBeTruthy();
	});

	test("reloads the form from a worker", async () => {
		const { routes, vacuumConfig } = await maintenanceApi();
		const app = renderApp("/maintenance/vacuum", {
			...routes,
			"POST /maintenance/job-types/vacuum/refresh": vacuumConfig,
		});
		fireEvent.click(await screen.findByRole("button", { name: "Reload settings form from the worker" }));
		expect(await screen.findByText("Settings form reloaded from the worker")).toBeTruthy();
		expect(app.api.last("POST", "/maintenance/job-types/vacuum/refresh")).toBeTruthy();
	});

	test("jobs and run history tabs", async () => {
		const { routes, vacuumJobs, runs } = await maintenanceApi();
		const app = renderApp("/maintenance/vacuum?tab=jobs", {
			...routes,
			"GET /maintenance/jobs": { jobs: vacuumJobs },
		});
		expect(await screen.findByLabelText("Search jobs")).toBeTruthy();
		expect(screen.getAllByRole("link", { name: /Vacuum volume/ }).length).toBe(vacuumJobs.length);
		expect(app.api.last("GET", "/maintenance/jobs")?.query.get("jobType")).toBe("vacuum");
		fireEvent.click(screen.getByRole("tab", { name: "Run history" }));
		await waitFor(() => expect(app.router.state.location.search).toEqual({ tab: "history" }));
		expect((await screen.findAllByText(runs[0]?.message as string)).length).toBe(runs.length);
		expect(within(screen.getByRole("tabpanel")).getAllByText("Succeeded").length).toBe(runs.length);
	});

	test("empty jobs and history explain themselves", async () => {
		const { routes } = await maintenanceApi();
		renderApp("/maintenance/vacuum?tab=jobs", {
			...routes,
			"GET /maintenance/jobs": { jobs: [] },
			"GET /maintenance/job-types/vacuum/runs": {
				runs: [
					{
						runId: "r",
						jobId: "",
						jobType: "vacuum",
						workerId: "",
						outcome: "error",
						message: "disk full",
						durationMs: 0,
						completedAt: null,
					},
				],
			},
		});
		expect(await screen.findByText("No jobs yet")).toBeTruthy();
		fireEvent.click(screen.getByRole("tab", { name: "Run history" }));
		expect(await screen.findByText("disk full")).toBeTruthy();
		expect(within(screen.getByRole("tabpanel")).getByText("Failed")).toBeTruthy();
	});

	test("viewers can read settings but not act", async () => {
		const { routes } = await maintenanceApi();
		renderApp("/maintenance/vacuum", routes, viewerUser);
		expect(await screen.findByText(/You have read-only access/)).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Run now" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Check for work" })).toBeNull();
	});

	test("unknown job types explain what to do", async () => {
		const { routes } = await maintenanceApi();
		renderApp("/maintenance/lance_compact", {
			...routes,
			"GET /maintenance/job-types/lance_compact": () =>
				Response.json(
					{
						error: 'No worker has registered the job type "lance_compact". Start a worker that supports it.',
						upstream: "admin",
					},
					{ status: 404 },
				),
		});
		expect(await screen.findByText(/No worker has registered the job type/)).toBeTruthy();
		expect(screen.getByRole("heading", { name: "Lance compact" })).toBeTruthy();
	});
});

describe("job type page failures", () => {
	test("jobs and history retry after errors, and jobs can be searched", async () => {
		const { routes, vacuumJobs } = await maintenanceApi();
		let fail = true;
		const down = () => Response.json({ error: "admin is unreachable", upstream: "admin" }, { status: 502 });
		renderApp("/maintenance/vacuum?tab=jobs", {
			...routes,
			"GET /maintenance/jobs": () => (fail ? down() : { jobs: vacuumJobs }),
			"GET /maintenance/job-types/vacuum/runs": () =>
				fail ? down() : routes["GET /maintenance/job-types/vacuum/runs"],
		});
		expect(await screen.findByText("SeaweedFS admin reported a problem")).toBeTruthy();
		fail = false;
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		const first = vacuumJobs[0]?.id as string;
		fireEvent.change(await screen.findByLabelText("Search jobs"), { target: { value: first } });
		expect(screen.getAllByRole("link", { name: /Vacuum volume/ })).toHaveLength(1);
		fail = true;
		fireEvent.click(screen.getByRole("tab", { name: "Run history" }));
		expect(await screen.findByText("SeaweedFS admin reported a problem")).toBeTruthy();
		fail = false;
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(await screen.findAllByText("Succeeded")).toBeTruthy();
	});

	test("a failed run from the proposals keeps the sheet open", async () => {
		const { routes, detection } = await maintenanceApi();
		renderApp("/maintenance/vacuum", {
			...routes,
			"POST /maintenance/job-types/vacuum/detect": detection,
			"POST /maintenance/job-types/vacuum/run": () =>
				Response.json({ error: "no executor available" }, { status: 500 }),
		});
		fireEvent.click(await screen.findByRole("button", { name: "Check for work" }));
		const sheet = await screen.findByRole("dialog");
		fireEvent.click(within(sheet).getByRole("button", { name: "Run these jobs" }));
		expect(await screen.findByText("no executor available")).toBeTruthy();
		expect(screen.getByText("Proposed jobs")).toBeTruthy();
	});
});

describe("detectionMessage", () => {
	test("covers every outcome", () => {
		const base: DetectionResult = {
			requestId: "",
			workerId: "",
			totalProposals: 0,
			proposals: [],
			skippedReason: "",
			eligibleAfter: null,
			activities: [],
			error: "",
		};
		expect(detectionMessage({ ...base, error: "boom" }, "Vacuum")).toBe("Vacuum check failed: boom");
		expect(detectionMessage({ ...base, totalProposals: 1 }, "Vacuum")).toBe("Vacuum found 1 job to run");
		expect(detectionMessage({ ...base, totalProposals: 3 }, "Vacuum")).toBe("Vacuum found 3 jobs to run");
		expect(detectionMessage({ ...base, skippedReason: "cooldown" }, "Vacuum")).toBe(
			"Vacuum skipped: cooldown",
		);
		expect(detectionMessage(base, "Vacuum")).toBe("Vacuum found nothing to do");
	});
});
