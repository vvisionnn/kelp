import { describe, expect, test } from "bun:test";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { objectsApi } from "../../../../test/objects-fixtures.ts";
import { choose } from "../../../../test/objects-helpers.ts";
import { type ApiCall, renderApp, viewerUser } from "../../../../test/render-app.tsx";
import { settle } from "../../../../test/settle.ts";
import { makeTelemetry } from "../../../../test/telemetry-fixtures.ts";

/** The folder list's entry for `name`; the summary's "Largest files" names files too. */
function inList(name: string): Promise<HTMLElement> {
	return waitFor(() => {
		const found = screen
			.getAllByText(name)
			.filter((element) => !element.closest('[aria-label="Folder summary"]'));
		if (found.length !== 1) throw new Error(`${name} is listed ${found.length} times`);
		return found[0] as HTMLElement;
	});
}

const ok = { ok: true };

describe("bucket dashboard", () => {
	test("shows this bucket's traffic, failures, quota and details", async () => {
		const { routes } = await objectsApi();
		renderApp("/buckets/backups", { ...routes, "GET /telemetry": makeTelemetry() });
		expect(await screen.findByRole("img", { name: "S3 requests per second to backups" })).toBeTruthy();
		expect(screen.getByRole("region", { name: "Requests" }).textContent).toContain("900");
		expect(screen.getByRole("region", { name: "Failed requests" }).textContent).toContain("0");
		const details = screen.getByLabelText("Bucket details");
		expect(within(details).getByText("s3://backups")).toBeTruthy();
		expect(within(details).getByText("Lifecycle")).toBeTruthy();
		expect(screen.getByRole("radiogroup", { name: "Time range" })).toBeTruthy();
	});

	test("a bucket with failed requests and no recent traffic reads accordingly", async () => {
		const { routes } = await objectsApi();
		const telemetry = makeTelemetry();
		telemetry.buckets = [
			{ bucket: "media", rps: 1, requests: 10, errors: 2, series: telemetry.points.map(() => 1) },
		];
		renderApp("/buckets/media", { ...routes, "GET /telemetry": telemetry });
		expect(await screen.findByText("20% of requests")).toBeTruthy();
		renderApp("/buckets/archive", { ...routes, "GET /telemetry": makeTelemetry() });
		expect(await screen.findByText("No requests in this range")).toBeTruthy();
	});

	test("without live metrics the traffic chart steps aside", async () => {
		const { routes } = await objectsApi();
		renderApp("/buckets/media", {
			...routes,
			"GET /telemetry": { ...makeTelemetry(), enabled: false, points: [], buckets: [] },
		});
		expect(await screen.findByText("Live metrics are off")).toBeTruthy();
		expect(screen.queryByRole("img", { name: /S3 requests per second to/ })).toBeNull();
	});
});

describe("bucket page", () => {
	test("shows the bucket's numbers, flags and objects", async () => {
		const { routes } = await objectsApi();
		renderApp("/buckets/media", routes);
		expect(await screen.findByRole("heading", { name: "media" })).toBeTruthy();
		expect(screen.getByText("Stored files")).toBeTruthy();
		expect(await inList("config.json")).toBeTruthy();
		expect(screen.getByRole("navigation", { name: "Folder path" }).textContent).toBe("media");
	});

	test("browsing folders keeps the path in the URL, inside the bucket", async () => {
		const { routes } = await objectsApi();
		const app = renderApp("/buckets/media", {
			...routes,
			"GET /files/list": (call: ApiCall) =>
				call.query.get("path") === "/buckets/media/photos"
					? { path: "/buckets/media/photos", entries: [], nextCursor: null }
					: (routes["GET /files/list"] as (c: typeof call) => unknown)(call),
		});
		fireEvent.click(await screen.findByRole("button", { name: "photos" }));
		await waitFor(() =>
			expect(app.router.state.location.search).toEqual({ tab: "objects", path: "/buckets/media/photos" }),
		);
		expect(await screen.findByText("This folder is empty")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "media" }));
		await waitFor(() => expect(app.router.state.location.search).toEqual({ tab: "objects" }));
	});

	test("deleting needs the bucket name typed, then returns to the list", async () => {
		const { routes } = await objectsApi();
		const app = renderApp("/buckets/media", { ...routes, "DELETE /buckets/media": ok });
		fireEvent.click(await screen.findByRole("button", { name: "Delete bucket" }));
		const dialog = await screen.findByRole("alertdialog");
		const confirm = within(dialog).getByRole("button", { name: "Delete bucket" });
		expect((confirm as HTMLButtonElement).disabled).toBe(true);
		fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "media" } });
		fireEvent.click(confirm);
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/buckets"));
		expect(app.api.last("DELETE", "/buckets/media")).toBeTruthy();
	});

	test("tabs switch with the URL", async () => {
		const { routes } = await objectsApi();
		const app = renderApp("/buckets/media", routes);
		for (const [tab, value] of [
			["Settings", "settings"],
			["Lifecycle", "lifecycle"],
			["Policy", "policy"],
			["Objects", "objects"],
		] as const) {
			fireEvent.click(await screen.findByRole("tab", { name: tab }));
			await waitFor(() => expect(app.router.state.location.search).toEqual({ tab: value }));
		}
	});

	test("explains a missing bucket", async () => {
		const { routes } = await objectsApi();
		renderApp("/buckets/ghost", {
			...routes,
			"GET /buckets/ghost": () =>
				Response.json({ error: "bucket not found", upstream: "admin" }, { status: 404 }),
		});
		expect(await screen.findByText("bucket not found")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(await screen.findByText("bucket not found")).toBeTruthy();
	});

	test("lifecycle and policy failures can be retried", async () => {
		const { routes } = await objectsApi();
		const down = () => Response.json({ error: "admin is unreachable", upstream: "admin" }, { status: 502 });
		renderApp("/buckets/media?tab=lifecycle", {
			...routes,
			"GET /buckets/media/lifecycle": down,
			"GET /buckets/media/policy": down,
		});
		fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
		expect(await screen.findByText("admin is unreachable")).toBeTruthy();
		fireEvent.click(screen.getByRole("tab", { name: "Policy" }));
		await waitFor(() =>
			expect(screen.getAllByRole("button", { name: "Try again" }).length).toBeGreaterThan(0),
		);
		for (const retry of screen.getAllByRole("button", { name: "Try again" })) fireEvent.click(retry);
		expect(await screen.findAllByText("admin is unreachable")).toBeTruthy();
	});
});

describe("bucket loading", () => {
	const never = () => new Promise<never>(() => {});

	test("the title, tabs and each tab's real structure stand while the bucket loads", async () => {
		const { routes } = await objectsApi();
		renderApp("/buckets/media", { ...routes, "GET /buckets/media": never });
		expect(await screen.findByRole("status", { name: "Loading bucket" })).toBeTruthy();
		expect(screen.getByRole("heading", { name: "media" })).toBeTruthy();
		expect((screen.getByRole("button", { name: "Delete bucket" }) as HTMLButtonElement).disabled).toBe(true);
		expect(screen.getByRole("status", { name: "Loading folder" })).toBeTruthy();
		for (const [tab, label] of [
			["Settings", "Loading settings"],
			["Lifecycle", "Loading lifecycle rules"],
			["Policy", "Loading policy"],
		] as const) {
			fireEvent.click(screen.getByRole("tab", { name: tab }));
			expect(await screen.findByRole("status", { name: label })).toBeTruthy();
		}
	});

	test("nothing below the bucket is asked for until it is known to exist", async () => {
		const { routes } = await objectsApi();
		const app = renderApp("/buckets/media", { ...routes, "GET /buckets/media": never });
		await screen.findByRole("status", { name: "Loading bucket" });
		await settle();
		expect(app.api.calls.some((call) => call.path === "/files/list")).toBe(false);
	});

	test("a telemetry failure does not hold the bucket back or call the metrics off early", async () => {
		const { routes } = await objectsApi();
		renderApp("/buckets/media", {
			...routes,
			"GET /telemetry": () => Response.json({ error: "sampler down" }, { status: 500 }),
		});
		expect(await screen.findByText("Live metrics are off")).toBeTruthy();
		expect(screen.queryByRole("radiogroup", { name: "Time range" })).toBeNull();
	});

	test("a bucket without a quota says so in its details", async () => {
		const { routes } = await objectsApi();
		renderApp("/buckets/media", routes);
		const details = await screen.findByLabelText("Bucket details");
		expect(within(details).getByText("Quota")).toBeTruthy();
		expect(within(details).getByText("No limit")).toBeTruthy();
	});

	test("lifecycle ghosts follow the bucket's own rule count", async () => {
		const { routes } = await objectsApi();
		for (const bucket of ["archive", "media"]) {
			renderApp(`/buckets/${bucket}?tab=lifecycle`, {
				...routes,
				[`GET /buckets/${bucket}/lifecycle`]: never,
			});
			expect((await screen.findAllByRole("status", { name: "Loading lifecycle rules" })).length).toBe(1);
			cleanup();
		}
	});
});

describe("settings tab", () => {
	test("changes the quota and the owner", async () => {
		const { routes } = await objectsApi();
		const app = renderApp("/buckets/archive?tab=settings", {
			...routes,
			"PUT /buckets/archive/quota": ok,
			"PUT /buckets/archive/owner": ok,
		});
		const size = (await screen.findByLabelText("Quota size")) as HTMLInputElement;
		expect(size.value).toBe("1");
		const saveQuota = screen.getByRole("button", { name: "Save quota" }) as HTMLButtonElement;
		expect(saveQuota.disabled).toBe(true);
		fireEvent.change(size, { target: { value: "2" } });
		await choose(screen.getByRole("combobox", { name: "Quota unit" }), "GiB");
		fireEvent.click(saveQuota);
		await waitFor(() =>
			expect(app.api.last("PUT", "/buckets/archive/quota")?.body).toEqual({
				enabled: true,
				bytes: 2 * 1024 ** 3,
			}),
		);
		expect(await screen.findByText("Quota set to 2 GiB")).toBeTruthy();

		await choose(screen.getByRole("combobox", { name: "Owner" }), "admin");
		fireEvent.click(screen.getByRole("button", { name: "Save owner" }));
		await waitFor(() =>
			expect(app.api.last("PUT", "/buckets/archive/owner")?.body).toEqual({ owner: "admin" }),
		);
		expect(await screen.findByText("Owner changed to admin")).toBeTruthy();

		expect(screen.getByText("Governance")).toBeTruthy();
		expect(screen.getByText("New objects are kept for 7 days.")).toBeTruthy();
	});

	test("removes the quota and the owner", async () => {
		const { routes, byName } = await objectsApi();
		const app = renderApp("/buckets/backups?tab=settings", {
			...routes,
			"GET /buckets/backups": { bucket: { ...byName("backups"), owner: "ci-bot" } },
			"PUT /buckets/backups/quota": ok,
			"PUT /buckets/backups/owner": ok,
		});
		fireEvent.click(await screen.findByRole("switch", { name: /Limit storage/ }));
		fireEvent.click(screen.getByRole("button", { name: "Save quota" }));
		await waitFor(() =>
			expect(app.api.last("PUT", "/buckets/backups/quota")?.body).toEqual({ enabled: false, bytes: 0 }),
		);
		expect(await screen.findByText("Quota removed")).toBeTruthy();
		await choose(screen.getByRole("combobox", { name: "Owner" }), "No owner (admins only)");
		fireEvent.click(screen.getByRole("button", { name: "Save owner" }));
		expect(await screen.findByText("Owner removed")).toBeTruthy();
		expect(screen.getByText("On")).toBeTruthy();
		expect(screen.getByText("Object lock can only be turned on when a bucket is created.")).toBeTruthy();
	});

	test("viewers see settings without controls", async () => {
		const { routes } = await objectsApi();
		renderApp("/buckets/archive?tab=settings", routes, viewerUser);
		expect(await screen.findByRole("heading", { name: "Quota" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Save quota" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Delete bucket" })).toBeNull();
	});
});

describe("lifecycle tab", () => {
	test("describes rules in plain words and saves edits", async () => {
		const { routes } = await objectsApi();
		const app = renderApp("/buckets/archive?tab=lifecycle", {
			...routes,
			"PUT /buckets/archive/lifecycle": ok,
		});
		expect(await screen.findByText("Objects under logs/, tagged env=dev")).toBeTruthy();
		expect(screen.getByText("Delete 30 days after creation")).toBeTruthy();
		expect(screen.getByText("Abandon unfinished uploads after 3 days")).toBeTruthy();
		expect(screen.getByText("Paused")).toBeTruthy();

		fireEvent.click(screen.getByRole("switch", { name: "Pause logs" }));
		expect(await screen.findByText("You have unsaved rule changes.")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Discard" }));
		await settle();
		expect(screen.queryByText("You have unsaved rule changes.")).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "Remove rule 2" }));
		fireEvent.click(screen.getByRole("switch", { name: "Pause logs" }));
		fireEvent.click(await screen.findByRole("button", { name: "Save rules" }));
		await waitFor(() => expect(app.api.last("PUT", "/buckets/archive/lifecycle")).toBeTruthy());
		expect(app.api.last("PUT", "/buckets/archive/lifecycle")?.body).toMatchObject({
			rules: [{ id: "logs", enabled: false, expirationDays: 30 }],
		});
		expect(await screen.findByText("Lifecycle rules saved")).toBeTruthy();
	});

	test("adds a rule through the editor, with validation", async () => {
		const { routes } = await objectsApi();
		const app = renderApp("/buckets/media?tab=lifecycle", { ...routes, "PUT /buckets/media/lifecycle": ok });
		expect(await screen.findByText("No lifecycle rules")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
		const sheet = await screen.findByRole("dialog");
		expect(within(sheet).getByText("New lifecycle rule")).toBeTruthy();
		fireEvent.change(within(sheet).getByLabelText("Name"), { target: { value: "tmp" } });
		fireEvent.change(within(sheet).getByLabelText("Key prefix"), { target: { value: "tmp/" } });
		fireEvent.click(within(sheet).getByRole("button", { name: "Add tag" }));
		fireEvent.change(within(sheet).getByLabelText("Tag key"), { target: { value: "env" } });
		expect(within(sheet).getByRole("alert").textContent).toBe("Fill in every tag key and value.");
		fireEvent.change(within(sheet).getByLabelText("Tag value"), { target: { value: "dev" } });
		fireEvent.change(within(sheet).getByLabelText("Minimum size"), { target: { value: "2" } });
		fireEvent.change(within(sheet).getByLabelText("Maximum size"), { target: { value: "1" } });
		expect(within(sheet).getByRole("alert").textContent).toBe(
			"The minimum size must be smaller than the maximum size.",
		);
		fireEvent.change(within(sheet).getByLabelText("Maximum size"), { target: { value: "" } });
		await choose(within(sheet).getByRole("combobox", { name: "Minimum size unit" }), "KiB");
		await choose(within(sheet).getByRole("combobox", { name: "Minimum size unit" }), "MiB");
		fireEvent.click(within(sheet).getByRole("radio", { name: "Keep them" }));
		expect(within(sheet).getByRole("alert").textContent).toBe("Choose at least one action.");
		fireEvent.click(within(sheet).getByRole("radio", { name: "Delete on a date" }));
		fireEvent.change(within(sheet).getByLabelText("Deletion date"), { target: { value: "2027-01-01" } });
		fireEvent.click(within(sheet).getByRole("switch", { name: /Remove leftover delete markers/ }));
		expect(within(sheet).getByRole("alert").textContent).toBe(
			"Removing delete markers cannot be combined with an expiration.",
		);
		fireEvent.click(within(sheet).getByRole("switch", { name: /Remove leftover delete markers/ }));
		fireEvent.change(within(sheet).getByLabelText("Delete old versions after (days)"), {
			target: { value: "14" },
		});
		fireEvent.change(within(sheet).getByLabelText("Always keep this many old versions"), {
			target: { value: "2" },
		});
		fireEvent.change(within(sheet).getByLabelText("Abandon unfinished uploads after (days)"), {
			target: { value: "1" },
		});
		fireEvent.click(within(sheet).getByRole("switch", { name: "Rule is active" }));
		fireEvent.click(within(sheet).getByRole("button", { name: "Keep rule" }));
		expect(await screen.findByText("Objects under tmp/, tagged env=dev, larger than 2 MiB")).toBeTruthy();
		expect(screen.getByText("Delete on 2027-01-01")).toBeTruthy();
		expect(screen.getByText("Always keep the newest 2 old versions")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
		await waitFor(() => expect(app.api.last("PUT", "/buckets/media/lifecycle")).toBeTruthy());
		expect(app.api.last("PUT", "/buckets/media/lifecycle")?.body).toEqual({
			rules: [
				{
					id: "tmp",
					enabled: false,
					prefix: "tmp/",
					tags: { env: "dev" },
					sizeGreaterThan: 2 * 1024 ** 2,
					sizeLessThan: null,
					expirationDays: null,
					expirationDate: "2027-01-01",
					expiredDeleteMarkers: false,
					noncurrentExpirationDays: 14,
					newerNoncurrentVersions: 2,
					abortMultipartDays: 1,
				},
			],
		});
	});

	test("saving leaves the rows in place", async () => {
		const { routes } = await objectsApi();
		renderApp("/buckets/archive?tab=lifecycle", { ...routes, "PUT /buckets/archive/lifecycle": ok });
		const row = (await screen.findByText("logs")).closest("li");
		fireEvent.click(screen.getByRole("switch", { name: "Pause logs" }));
		fireEvent.click(await screen.findByRole("button", { name: "Save rules" }));
		expect(await screen.findByText("Lifecycle rules saved")).toBeTruthy();
		await settle();
		expect(screen.getByText("logs").closest("li")).toBe(row);
	});

	test("edits an existing rule and rejects duplicate names", async () => {
		const { routes } = await objectsApi();
		renderApp("/buckets/archive?tab=lifecycle", routes);
		fireEvent.click(await screen.findByRole("button", { name: "Edit rule 2" }));
		const sheet = await screen.findByRole("dialog");
		expect(within(sheet).getByText("Edit lifecycle rule")).toBeTruthy();
		fireEvent.change(within(sheet).getByLabelText("Name"), { target: { value: "logs" } });
		expect(within(sheet).getByRole("alert").textContent).toBe("Another rule already uses that name.");
		fireEvent.change(within(sheet).getByLabelText("Name"), { target: { value: "uploads" } });
		fireEvent.click(within(sheet).getByRole("radio", { name: /number of days/ }));
		fireEvent.change(within(sheet).getByLabelText("Days until deletion"), { target: { value: "5" } });
		fireEvent.click(within(sheet).getByRole("button", { name: "Keep rule" }));
		expect(await screen.findByText("Delete 5 days after creation")).toBeTruthy();
		expect(screen.getByText("uploads")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Edit uploads" }));
		const again = await screen.findByRole("dialog");
		fireEvent.click(within(again).getByRole("button", { name: "Add tag" }));
		fireEvent.click(within(again).getByRole("button", { name: "Remove tag" }));
		fireEvent.click(within(again).getByRole("button", { name: "Close" }));
		await settle(300);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	test("removing every rule clears the configuration", async () => {
		const { routes } = await objectsApi();
		const app = renderApp("/buckets/archive?tab=lifecycle", {
			...routes,
			"PUT /buckets/archive/lifecycle": ok,
		});
		fireEvent.click(await screen.findByRole("button", { name: "Remove logs" }));
		fireEvent.click(screen.getByRole("button", { name: "Remove rule 1" }));
		fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
		expect(await screen.findByText("Lifecycle rules removed")).toBeTruthy();
		expect(app.api.last("PUT", "/buckets/archive/lifecycle")?.body).toEqual({ rules: [] });
	});
});

describe("policy tab", () => {
	test("edits the policy as JSON, with templates and validation", async () => {
		const { routes } = await objectsApi();
		const app = renderApp("/buckets/archive?tab=policy", { ...routes, "PUT /buckets/archive/policy": ok });
		const editor = (await screen.findByLabelText("Bucket policy JSON")) as HTMLTextAreaElement;
		expect(JSON.parse(editor.value).Statement[0].Effect).toBe("Allow");
		const save = screen.getByRole("button", { name: "Save policy" }) as HTMLButtonElement;
		expect(save.disabled).toBe(true);

		fireEvent.change(editor, { target: { value: "{ nope" } });
		expect(screen.getByRole("alert").textContent).toStartWith("Not valid JSON");
		fireEvent.change(editor, { target: { value: "[]" } });
		expect(screen.getByRole("alert").textContent).toBe("A policy is a JSON object.");
		fireEvent.change(editor, { target: { value: '{"Statement": []}' } });
		expect(screen.getByRole("alert").textContent).toBe("Add at least one statement.");
		fireEvent.change(editor, { target: { value: '{"Version": "1"}' } });
		expect(screen.getByRole("alert").textContent).toBe("Add a Statement list with at least one statement.");
		fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
		expect(editor.value).toContain('"Allow"');

		fireEvent.click(screen.getByRole("button", { name: "Start from a template" }));
		fireEvent.click(await screen.findByText("Block deletes"));
		await waitFor(() => expect(editor.value).toContain("DenyDelete"));
		fireEvent.click(save);
		await waitFor(() => expect(app.api.last("PUT", "/buckets/archive/policy")).toBeTruthy());
		expect(app.api.last("PUT", "/buckets/archive/policy")?.body).toMatchObject({
			policy: { Statement: [{ Sid: "DenyDelete", Resource: ["arn:aws:s3:::archive/*"] }] },
		});
		expect(await screen.findByText("Bucket policy saved")).toBeTruthy();
	});

	test("removes the policy after confirming", async () => {
		const { routes } = await objectsApi();
		const app = renderApp("/buckets/archive?tab=policy", { ...routes, "DELETE /buckets/archive/policy": ok });
		fireEvent.click(await screen.findByRole("button", { name: "Remove policy" }));
		const dialog = await screen.findByRole("alertdialog");
		fireEvent.click(within(dialog).getByRole("button", { name: "Remove policy" }));
		expect(await screen.findByText("Bucket policy removed")).toBeTruthy();
		expect(app.api.last("DELETE", "/buckets/archive/policy")).toBeTruthy();
	});

	test("an empty bucket policy invites a template; unreadable stored text can be fixed", async () => {
		const { routes } = await objectsApi();
		renderApp("/buckets/media?tab=policy", {
			...routes,
			"GET /buckets/media/policy": { policy: null, invalidText: "{broken" },
		});
		expect(await screen.findByText(/SeaweedFS stored a policy it cannot read/)).toBeTruthy();
		expect((screen.getByLabelText("Bucket policy JSON") as HTMLTextAreaElement).value).toBe("{broken");
	});

	test("without a policy there is nothing to remove; viewers only read", async () => {
		const { routes } = await objectsApi();
		renderApp("/buckets/media?tab=policy", routes, viewerUser);
		expect(await screen.findByText(/No bucket policy/)).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Save policy" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Start from a template" })).toBeNull();
	});
});
