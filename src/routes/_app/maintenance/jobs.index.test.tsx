import { describe, expect, test } from "bun:test";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { maintenanceApi } from "../../../../test/maintenance-fixtures.ts";
import { renderApp } from "../../../../test/render-app.tsx";

/** Taps a segment the way a pointer does: press on it, release over the track. */
function pickSegment(radio: HTMLElement) {
	fireEvent.pointerDown(radio, { pointerId: 1, button: 0 });
	fireEvent.pointerUp(radio.closest("[role=radiogroup]") as HTMLElement, { pointerId: 1, button: 0 });
}

describe("maintenance jobs page", () => {
	test("lists jobs and filters by state and type through the URL", async () => {
		const { routes, jobs } = await maintenanceApi();
		const app = renderApp("/maintenance/jobs", routes);
		expect(await screen.findByRole("heading", { name: "Maintenance jobs" })).toBeTruthy();
		expect(
			screen.getAllByRole("link", { name: /Vacuum volume|Run admin script|S3 lifecycle/ }).length,
		).toBeGreaterThan(0);
		expect(jobs.length).toBeGreaterThan(0);

		pickSegment(screen.getByRole("radio", { name: /^Failed/ }));
		await waitFor(() => expect(app.router.state.location.search).toEqual({ state: "failed" }));
		await waitFor(() => expect(app.api.last("GET", "/maintenance/jobs")?.query.get("state")).toBe("failed"));
		pickSegment(screen.getByRole("radio", { name: /^All/ }));
		await waitFor(() => expect(app.router.state.location.search).toEqual({}));

		const trigger = screen.getByRole("combobox", { name: "Filter by job type" });
		fireEvent.pointerDown(trigger, { pointerType: "mouse", button: 0 });
		fireEvent.mouseDown(trigger);
		fireEvent.click(trigger);
		const option = await screen.findByRole("option", { name: "Volume vacuum" });
		fireEvent.pointerDown(option, { pointerType: "mouse", button: 0 });
		fireEvent.mouseUp(option);
		fireEvent.pointerUp(option, { pointerType: "mouse", button: 0 });
		fireEvent.click(option);
		await waitFor(() => expect(app.router.state.location.search).toEqual({ jobType: "vacuum" }));
	});

	test("filtered and unfiltered empty states", async () => {
		const { routes } = await maintenanceApi();
		renderApp("/maintenance/jobs?state=failed&jobType=vacuum", {
			...routes,
			"GET /maintenance/jobs": { jobs: [] },
		});
		expect(await screen.findByText("No jobs match these filters")).toBeTruthy();
		expect(screen.getByRole("combobox", { name: "Filter by job type" }).textContent).toContain(
			"Volume vacuum",
		);
	});

	test("an empty history and unknown job types", async () => {
		const { routes } = await maintenanceApi();
		renderApp("/maintenance/jobs?jobType=brand_new", {
			...routes,
			"GET /maintenance/jobs": {
				jobs: [
					{
						id: "x",
						jobType: "brand_new",
						state: "pending",
						summary: "",
						message: "",
						createdAt: null,
						completedAt: null,
					},
				],
			},
		});
		expect(await screen.findByRole("link", { name: "Brand new" })).toBeTruthy();
		expect(screen.getByRole("combobox", { name: "Filter by job type" }).textContent).toContain("Brand new");
	});

	test("explains an empty history", async () => {
		const { routes } = await maintenanceApi();
		renderApp("/maintenance/jobs", { ...routes, "GET /maintenance/jobs": { jobs: [] } });
		expect(await screen.findByText("No jobs yet")).toBeTruthy();
	});

	test("searches jobs and retries after an error", async () => {
		const { routes, jobs } = await maintenanceApi();
		let fail = true;
		renderApp("/maintenance/jobs", {
			...routes,
			"GET /maintenance/jobs": () =>
				fail
					? Response.json({ error: "admin is unreachable", upstream: "admin" }, { status: 502 })
					: { jobs },
		});
		expect(await screen.findByText("SeaweedFS admin reported a problem")).toBeTruthy();
		fail = false;
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		fireEvent.change(await screen.findByLabelText("Search jobs"), { target: { value: "no-such-job" } });
		expect(await screen.findByText('Nothing matches "no-such-job".')).toBeTruthy();
	});
});
