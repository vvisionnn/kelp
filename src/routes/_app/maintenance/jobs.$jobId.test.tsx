import { describe, expect, test } from "bun:test";
import type { JobDetail, MaintenanceActivity } from "@shared/maintenance.ts";
import { fireEvent, screen, within } from "@testing-library/react";
import { maintenanceApi } from "../../../../test/maintenance-fixtures.ts";
import { renderApp, viewerUser } from "../../../../test/render-app.tsx";
import { timeline } from "./jobs.$jobId.tsx";

const path = (detail: JobDetail) => `/maintenance/jobs/${detail.job.id}`;

describe("maintenance job page", () => {
	test("shows result, outputs, parameters, timeline and related jobs", async () => {
		const { routes, detail } = await maintenanceApi();
		renderApp(path(detail), { ...routes, [`GET ${path(detail)}`]: detail });
		expect(await screen.findByRole("heading", { name: detail.job.summary })).toBeTruthy();
		expect(screen.getByText("Succeeded")).toBeTruthy();
		expect(screen.getByText("Outputs")).toBeTruthy();
		expect(screen.getAllByText("Volume id", { selector: "dt" })).toHaveLength(2);
		expect(screen.getByText("Job queued for execution")).toBeTruthy();
		expect(screen.queryByText(/progress \d+%/)).toBeNull();
		expect(screen.getByRole("button", { name: "Copy job id" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Expire job" })).toBeNull();
		expect(screen.getByRole("link", { name: "Vacuum" }).getAttribute("href")).toBe("/maintenance/vacuum");
	});

	test("active jobs show progress and can be expired", async () => {
		const { routes, detail } = await maintenanceApi();
		const running: JobDetail = {
			...detail,
			job: {
				...detail.job,
				state: "running",
				progress: 40,
				stage: "copying",
				message: "copying data",
				errorMessage: "",
				resultSummary: "",
				detail: "",
				completedAt: null,
			},
			run: null,
			activities: [],
			related: [],
		};
		const app = renderApp(path(detail), {
			...routes,
			[`GET ${path(detail)}`]: running,
			[`POST ${path(detail)}/expire`]: { expired: true, job: null },
		});
		expect(await screen.findByRole("progressbar", { name: "Job progress" })).toBeTruthy();
		expect(screen.getByText("Copying, copying data")).toBeTruthy();
		expect(screen.getAllByText("40%").length).toBeGreaterThan(0);
		expect(screen.getByText("No events recorded for this job.")).toBeTruthy();
		expect(screen.getByText("Not yet")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Expire job" }));
		const dialog = await screen.findByRole("alertdialog");
		fireEvent.click(within(dialog).getByRole("button", { name: "Expire job" }));
		expect(await screen.findByText("Job expired")).toBeTruthy();
		expect(app.api.last("POST", `${path(detail)}/expire`)).toBeTruthy();
	});

	test("failed jobs lead with the error; viewers cannot expire", async () => {
		const { routes, detail } = await maintenanceApi();
		const failed: JobDetail = {
			...detail,
			job: {
				...detail.job,
				state: "pending",
				errorMessage: "volume is read only",
				resultSummary: "",
				workerId: "",
				attempt: 0,
				outputs: {},
				parameters: {},
			},
		};
		renderApp(path(detail), { ...routes, [`GET ${path(detail)}`]: failed }, viewerUser);
		expect(await screen.findByText("Volume is read only")).toBeTruthy();
		expect(screen.getByText("Error")).toBeTruthy();
		expect(screen.getByText("Not assigned")).toBeTruthy();
		expect(screen.getByText("This job reported no outputs.")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Expire job" })).toBeNull();
	});

	test("an expire that finds the job finished says so", async () => {
		const { routes, detail } = await maintenanceApi();
		const queued: JobDetail = { ...detail, job: { ...detail.job, state: "assigned" } };
		renderApp(path(detail), {
			...routes,
			[`GET ${path(detail)}`]: queued,
			[`POST ${path(detail)}/expire`]: { expired: false, job: null },
		});
		fireEvent.click(await screen.findByRole("button", { name: "Expire job" }));
		fireEvent.click(
			within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Expire job" }),
		);
		expect(await screen.findByText("The job had already finished")).toBeTruthy();
	});

	test("missing jobs show the error", async () => {
		const { routes } = await maintenanceApi();
		renderApp("/maintenance/jobs/gone", {
			...routes,
			"GET /maintenance/jobs/gone": () =>
				Response.json({ error: "job detail not found", upstream: "admin" }, { status: 404 }),
		});
		expect(await screen.findByText("job detail not found")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
	});
});

describe("timeline", () => {
	const at = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString();
	const event = (message: string, s: number, occurredAt: string | null = at(s)): MaintenanceActivity => ({
		jobId: "j",
		jobType: "vacuum",
		requestId: "",
		workerId: "",
		source: "",
		stage: "",
		message,
		details: {},
		occurredAt,
	});

	test("finished jobs hide progress; running jobs keep the latest tick; repeats are dropped", () => {
		const events = [
			event("progress 90%", 3),
			event("queued", 1),
			event("progress 50%", 2),
			event("done", 4),
			event("done", 5),
			event("x", 0, null),
		];
		expect(timeline(events, false).map((e) => e.message)).toEqual(["x", "queued", "done"]);
		expect(timeline(events, true).map((e) => e.message)).toEqual(["x", "queued", "progress 90%", "done"]);
	});
});
