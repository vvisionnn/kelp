import { describe, expect, test } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { objectsApi } from "../../../../test/objects-fixtures.ts";
import { choose } from "../../../../test/objects-helpers.ts";
import { renderApp, viewerUser } from "../../../../test/render-app.tsx";
import { pickSegment } from "../../../../test/segment.ts";
import { settle } from "../../../../test/settle.ts";
import { makeTelemetry } from "../../../../test/telemetry-fixtures.ts";

async function openCreate() {
	fireEvent.click(await screen.findByRole("button", { name: "Create bucket" }));
	return screen.findByRole("dialog");
}

describe("buckets dashboard", () => {
	test("headlines totals and live traffic, ranks busy buckets and shows requests per bucket", async () => {
		const { routes } = await objectsApi();
		const app = renderApp("/buckets", { ...routes, "GET /telemetry": makeTelemetry() });
		expect(await screen.findByRole("img", { name: "S3 requests per second by type" })).toBeTruthy();
		expect(screen.getByRole("region", { name: "S3 requests" }).textContent).toContain("/s");
		expect(screen.getByRole("region", { name: "Failed requests" }).textContent).toContain("%");
		const busiest = screen.getByRole("list", { name: "Buckets by S3 requests" });
		expect(within(busiest).getByRole("link", { name: "backups" })).toBeTruthy();
		// Traffic to buckets that no longer exist is left out.
		expect(within(busiest).queryByText("photo-library")).toBeNull();
		expect(screen.getByRole("img", { name: "Object data per bucket" })).toBeTruthy();
		expect(screen.getByRole("list", { name: "Quota usage" })).toBeTruthy();
		expect(screen.getByRole("img", { name: "Objects by size" })).toBeTruthy();
		// The bucket table is the one without a caption; charts carry captioned data tables.
		const table = screen.getAllByRole("table").find((t) => !t.querySelector("caption")) as HTMLElement;
		expect(within(table).getByText("900")).toBeTruthy();
		expect(within(table).getAllByText("–").length).toBeGreaterThan(0);
		pickSegment(
			within(screen.getByRole("radiogroup", { name: "Time range" })).getByRole("radio", { name: "24h" }),
		);
		await waitFor(() => expect(app.api.last("GET", "/telemetry")?.query.get("range")).toBe("24h"));
	});

	test("without live metrics it still shows what the buckets hold", async () => {
		const { routes } = await objectsApi();
		renderApp("/buckets", {
			...routes,
			"GET /telemetry": { ...makeTelemetry(), enabled: false, points: [], buckets: [], objectSizes: [] },
		});
		expect(await screen.findByText("Live metrics are off")).toBeTruthy();
		expect(screen.getByText("Appears once live metrics are on.")).toBeTruthy();
		expect(screen.queryByRole("radiogroup", { name: "Time range" })).toBeNull();
		expect(screen.queryByRole("columnheader", { name: /Requests/ })).toBeNull();
	});

	test("says so when no bucket has data or a quota", async () => {
		const { routes, buckets } = await objectsApi();
		const empty = buckets.map((b) => ({ ...b, logicalSize: 0, quota: { enabled: false, bytes: 0 } }));
		renderApp("/buckets", {
			...routes,
			"GET /buckets": { buckets: empty },
			"GET /telemetry": makeTelemetry(),
		});
		expect(await screen.findByText("No bucket holds data yet.")).toBeTruthy();
		expect(screen.getByText("No bucket has a quota. Set one in a bucket's settings.")).toBeTruthy();
	});
});

describe("buckets page", () => {
	test("lists buckets with their data, quota, owner and flags", async () => {
		const { routes } = await objectsApi();
		renderApp("/buckets", routes);
		const table = await screen.findByRole("table");
		for (const name of ["archive", "backups", "media"]) expect(within(table).getByText(name)).toBeTruthy();
		expect(within(table).getByText("Object lock")).toBeTruthy();
		expect(within(table).getAllByText("Versioned").length).toBe(2);
		expect(within(table).getByText("Lifecycle")).toBeTruthy();
		expect(within(table).getByText("Policy")).toBeTruthy();
		expect(within(table).getAllByText("No limit").length).toBe(1);
		expect(within(table).getAllByRole("meter").length).toBe(2);
		expect(screen.getByText("Object data")).toBeTruthy();
	});

	test("names a bucket's owner, and says admins only when it has none", async () => {
		const { routes, byName } = await objectsApi();
		renderApp("/buckets", {
			...routes,
			"GET /buckets": { buckets: [{ ...byName("backups"), owner: "ci-bot" }, byName("archive")] },
		});
		const table = await screen.findByRole("table");
		expect(within(table).getByText("ci-bot")).toBeTruthy();
		expect(within(table).getByText("Admins only")).toBeTruthy();
	});

	test("search narrows the list and rows open the bucket", async () => {
		const { routes } = await objectsApi();
		const app = renderApp("/buckets", routes);
		fireEvent.change(await screen.findByLabelText("Search buckets"), { target: { value: "back" } });
		const table = screen.getByRole("table");
		expect(within(table).queryByText("media")).toBeNull();
		fireEvent.click(within(table).getByText("10 GiB", { exact: false }));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/buckets/backups"));
	});

	test("creates a bucket with quota, versioning and object lock, then opens it", async () => {
		const { routes } = await objectsApi();
		const app = renderApp("/buckets", { ...routes, "POST /buckets": { name: "team-assets" } });
		const dialog = await openCreate();
		const name = within(dialog).getByLabelText("Name");
		fireEvent.change(name, { target: { value: "Team-Assets" } });
		expect((name as HTMLInputElement).value).toBe("team-assets");
		fireEvent.click(within(dialog).getByRole("switch", { name: /Limit storage/ }));
		fireEvent.change(within(dialog).getByLabelText("Quota size"), { target: { value: "5" } });
		fireEvent.click(within(dialog).getByRole("switch", { name: /Object lock/ }));
		expect(
			within(dialog)
				.getByRole("switch", { name: /Keep every version/ })
				.getAttribute("aria-checked"),
		).toBe("true");
		fireEvent.click(within(dialog).getByRole("radio", { name: /Compliance/ }));
		fireEvent.change(within(dialog).getByLabelText("Default retention (days)"), { target: { value: "30" } });
		fireEvent.click(within(dialog).getByRole("button", { name: "Create bucket" }));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/buckets/team-assets"));
		expect(app.api.last("POST", "/buckets")?.body).toEqual({
			name: "team-assets",
			owner: "",
			quotaBytes: 5 * 1024 ** 3,
			versioning: true,
			objectLock: { mode: "COMPLIANCE", retentionDays: 30 },
		});
		expect(await screen.findByText("Bucket team-assets created")).toBeTruthy();
	});

	test("creates a plain bucket with an owner", async () => {
		const { routes } = await objectsApi();
		const app = renderApp("/buckets", { ...routes, "POST /buckets": { name: "plain" } });
		const dialog = await openCreate();
		fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "plain" } });
		fireEvent.click(within(dialog).getByRole("switch", { name: /Keep every version/ }));
		await choose(within(dialog).getByRole("combobox", { name: "Owner" }), "ci-bot");
		fireEvent.click(within(dialog).getByRole("button", { name: "Create bucket" }));
		await waitFor(() => expect(app.api.last("POST", "/buckets")).toBeTruthy());
		expect(app.api.last("POST", "/buckets")?.body).toEqual({
			name: "plain",
			owner: "ci-bot",
			quotaBytes: null,
			versioning: true,
			objectLock: null,
		});
	});

	test("explains invalid names and keeps the dialog open on errors", async () => {
		const { routes } = await objectsApi();
		const app = renderApp("/buckets", {
			...routes,
			"POST /buckets": () =>
				Response.json(
					{ error: "Failed to create bucket: already exists", upstream: "admin" },
					{ status: 500 },
				),
		});
		const dialog = await openCreate();
		const name = within(dialog).getByLabelText("Name");
		fireEvent.change(name, { target: { value: "ab" } });
		fireEvent.blur(name);
		expect(within(dialog).getByText("Use 3 to 63 characters")).toBeTruthy();
		fireEvent.click(within(dialog).getByRole("button", { name: "Create bucket" }));
		expect(app.api.last("POST", "/buckets")).toBeUndefined();
		fireEvent.change(name, { target: { value: "media" } });
		fireEvent.click(within(dialog).getByRole("button", { name: "Create bucket" }));
		expect(await screen.findByText("Failed to create bucket: already exists")).toBeTruthy();
		expect(screen.getByRole("dialog")).toBeTruthy();
	});

	test("viewers see buckets but cannot create them", async () => {
		const { routes } = await objectsApi();
		renderApp("/buckets", { ...routes, "GET /buckets": { buckets: [] } }, viewerUser);
		expect(await screen.findByText("No buckets yet")).toBeTruthy();
		expect(screen.getByText("An administrator can create buckets for S3 clients.")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Create bucket" })).toBeNull();
	});

	test("admins get a create action in the empty state", async () => {
		const { routes } = await objectsApi();
		renderApp("/buckets", { ...routes, "GET /buckets": { buckets: [] } });
		expect(await screen.findByText("Create a bucket to start storing objects over S3.")).toBeTruthy();
		expect(screen.getAllByRole("button", { name: "Create bucket" }).length).toBe(2);
	});

	test("sorts by files and quota, and the name links to the bucket", async () => {
		const { routes } = await objectsApi();
		const app = renderApp("/buckets", routes);
		const table = await screen.findByRole("table");
		const names = () =>
			within(table)
				.getAllByRole("link")
				.map((l) => l.textContent);
		fireEvent.click(within(table).getByText("Files"));
		expect(names()).toEqual(["archive", "backups", "media"]);
		fireEvent.click(within(table).getByText("Quota"));
		expect(names().sort()).toEqual(["archive", "backups", "media"]);
		fireEvent.click(within(table).getByRole("link", { name: "archive" }));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/buckets/archive"));
	});

	test("sorts by requests when traffic is live", async () => {
		const { routes } = await objectsApi();
		renderApp("/buckets", { ...routes, "GET /telemetry": makeTelemetry() });
		const requests = await screen.findByRole("button", { name: /^Requests/ });
		const table = requests.closest("table") as HTMLElement;
		const names = () =>
			within(table)
				.getAllByRole("link")
				.map((l) => l.textContent);
		fireEvent.click(requests);
		expect(names().at(-1)).toBe("backups");
		fireEvent.click(requests);
		expect(names()[0]).toBe("backups");
	});

	test("closing the create dialog starts fresh next time", async () => {
		const { routes } = await objectsApi();
		renderApp("/buckets", routes);
		let dialog = await openCreate();
		fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "draft" } });
		fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
		await settle(300);
		dialog = await openCreate();
		expect((within(dialog).getByLabelText("Name") as HTMLInputElement).value).toBe("");
		fireEvent.click(within(dialog).getByRole("switch", { name: /Object lock/ }));
		fireEvent.click(within(dialog).getByRole("switch", { name: /Object lock/ }));
		await settle(300);
		expect(within(dialog).queryByRole("radio", { name: /Governance/ })).toBeNull();
	});

	test("a failing list can be retried", async () => {
		const { routes } = await objectsApi();
		let fail = true;
		renderApp("/buckets", {
			...routes,
			"GET /buckets": () =>
				fail
					? Response.json({ error: "admin is unreachable", upstream: "admin" }, { status: 502 })
					: routes["GET /buckets"],
		});
		expect(await screen.findByText("admin is unreachable")).toBeTruthy();
		fail = false;
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(await screen.findByRole("table")).toBeTruthy();
	});
});
