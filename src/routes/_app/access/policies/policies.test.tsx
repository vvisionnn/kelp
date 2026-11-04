import { describe, expect, test } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { accessApi } from "../../../../../test/access-fixtures.ts";
import { renderApp, viewerUser } from "../../../../../test/render-app.tsx";
import { choose } from "../../../../../test/select.ts";

const editor = () => screen.getByLabelText("Policy document") as HTMLTextAreaElement;

describe("policies list", () => {
	test("shows usage and opens a policy", async () => {
		const { routes, policies } = await accessApi();
		const app = renderApp("/access/policies", {
			...routes,
			"GET /iam/policies": {
				policies: [
					...policies,
					{ ...policies[0], name: "spare", attachedTo: { users: ["x"], groups: [] } },
					{ ...policies[0], name: "unused", attachedTo: { users: [], groups: ["a", "b"] } },
				],
			},
		});
		expect(await screen.findByText("2 users, 1 group")).toBeTruthy();
		expect(screen.getByText("1 user")).toBeTruthy();
		expect(screen.getByText("2 groups")).toBeTruthy();
		fireEvent.click(screen.getByText("ro"));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/access/policies/ro"));
		expect(await screen.findByText("Used by: 2 users, 1 group")).toBeTruthy();
	});

	test("sorts by usage and searches", async () => {
		const { routes } = await accessApi();
		renderApp("/access/policies", routes);
		await screen.findByText("2 users, 1 group");
		for (const header of ["Policy", "Statements", "Used by", "Updated"])
			fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: header }));
		fireEvent.change(screen.getByLabelText("Search policies"), { target: { value: "devs" } });
		expect(screen.getByText("ro")).toBeTruthy();
	});

	test("empty list, and viewers cannot create", async () => {
		const { routes } = await accessApi();
		renderApp("/access/policies", { ...routes, "GET /iam/policies": { policies: [] } }, viewerUser);
		expect(await screen.findByText("No policies yet")).toBeTruthy();
		expect(screen.queryByRole("link", { name: "Create policy" })).toBeNull();
	});

	test("admins can start a new policy from the list", async () => {
		const { routes } = await accessApi();
		const app = renderApp("/access/policies", { ...routes, "GET /iam/policies": { policies: [] } });
		await screen.findByText("No policies yet");
		fireEvent.click(screen.getAllByRole("link", { name: "Create policy" })[0] as HTMLElement);
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/access/policies/new"));
	});
});

describe("policy editor", () => {
	test("creates from a template, checking as you type", async () => {
		const { routes, policies } = await accessApi();
		const app = renderApp("/access/policies/new", {
			...routes,
			"POST /iam/policies": () =>
				Response.json({ policy: { ...policies[0], name: "media-rw" } }, { status: 201 }),
			"GET /iam/policies/media-rw": { policy: { ...policies[0], name: "media-rw" } },
		});
		expect(await screen.findByText("Policy document is valid", {}, { timeout: 3000 })).toBeTruthy();
		fireEvent.change(screen.getByLabelText("Bucket"), { target: { value: "media" } });
		expect(editor().value).toContain("arn:aws:s3:::media/*");
		await choose("Template", "Read and write bucket");
		expect(editor().value).toContain("s3:PutObject");
		expect(editor().value).toContain("arn:aws:s3:::media");
		await choose("Template", "Full access");
		expect(editor().value).toContain('"s3:*"');
		await choose("Template", "Read and write bucket");

		fireEvent.change(screen.getByLabelText("Name"), { target: { value: " media-rw " } });
		const create = screen.getByRole("button", { name: "Create policy" }) as HTMLButtonElement;
		await waitFor(() => expect(create.disabled).toBe(false), { timeout: 3000 });
		fireEvent.click(create);
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/access/policies/media-rw"));
		const body = app.api.last("POST", "/iam/policies")?.body as {
			name: string;
			document: { Statement: unknown[] };
		};
		expect(body.name).toBe("media-rw");
		expect(JSON.stringify(body.document)).toContain("s3:PutObject");
	});

	test("explains syntax and policy problems", async () => {
		const { routes } = await accessApi();
		let valid = false;
		renderApp("/access/policies/new", {
			...routes,
			"POST /iam/policies/validate": () =>
				valid
					? { valid: true, message: "Policy document is valid" }
					: { valid: false, message: "Statement 1: Effect must be 'Allow' or 'Deny'" },
		});
		expect(
			await screen.findByText("Statement 1: Effect must be 'Allow' or 'Deny'", {}, { timeout: 3000 }),
		).toBeTruthy();
		fireEvent.change(editor(), { target: { value: "{" } });
		expect(await screen.findByText(/^Not valid JSON/)).toBeTruthy();
		fireEvent.change(editor(), { target: { value: "[]" } });
		expect(await screen.findByText("A policy is a JSON object.")).toBeTruthy();
		fireEvent.change(editor(), { target: { value: "{}" } });
		expect(await screen.findByText('Add a "Version", usually "2012-10-17".')).toBeTruthy();
		fireEvent.change(editor(), { target: { value: '{"Version":"2012-10-17"}' } });
		expect(await screen.findByText('Add a "Statement" list.')).toBeTruthy();
		valid = true;
		fireEvent.change(editor(), { target: { value: '{"Version":"2012-10-17","Statement":[]}' } });
		expect(await screen.findByText("Checking with SeaweedFS…")).toBeTruthy();
		expect(await screen.findByText("Policy document is valid", {}, { timeout: 3000 })).toBeTruthy();
	});

	test("reports when SeaweedFS cannot check the document", async () => {
		const { routes } = await accessApi();
		renderApp("/access/policies/new", {
			...routes,
			"POST /iam/policies/validate": () => Response.json({ error: "admin is unreachable" }, { status: 502 }),
		});
		expect(await screen.findByText("admin is unreachable", {}, { timeout: 3000 })).toBeTruthy();
	});

	test("edits a policy in use but will not delete it", async () => {
		const { routes, policies } = await accessApi();
		const app = renderApp("/access/policies/ro", {
			...routes,
			"PUT /iam/policies/ro": { policy: policies[0] },
		});
		const save = (await screen.findByRole("button", { name: "Save policy" })) as HTMLButtonElement;
		expect(screen.getByText("Detach it from 3 places before deleting.")).toBeTruthy();
		const usedBy = screen.getByText("Used by").closest("section") as HTMLElement;
		expect(within(usedBy).getByText("alice")).toBeTruthy();
		expect(within(usedBy).getByText("devs")).toBeTruthy();
		expect(screen.getByText("arn:aws:iam::000000000000:user/bob")).toBeTruthy();
		await waitFor(() => expect(screen.getByText("Policy document is valid")).toBeTruthy(), { timeout: 3000 });
		expect(save.disabled).toBe(true);
		fireEvent.change(editor(), {
			target: { value: editor().value.replace("s3:GetObject", "s3:GetObjectVersion") },
		});
		await waitFor(() => expect(save.disabled).toBe(false), { timeout: 3000 });
		fireEvent.click(save);
		await waitFor(() =>
			expect(JSON.stringify(app.api.last("PUT", "/iam/policies/ro")?.body)).toContain("GetObjectVersion"),
		);
		expect(await screen.findByText("Policy ro saved")).toBeTruthy();
	});

	test("deletes an unused policy", async () => {
		const { routes, policies } = await accessApi();
		const app = renderApp("/access/policies/ro", {
			...routes,
			"GET /iam/policies/ro": { policy: { ...policies[0], attachedTo: { users: [], groups: [] } } },
			"DELETE /iam/policies/ro": { ok: true },
		});
		expect(await screen.findByText("Not attached to anyone.")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Delete policy" }));
		const dialog = await screen.findByRole("alertdialog");
		fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "ro" } });
		fireEvent.click(within(dialog).getByRole("button", { name: "Delete policy" }));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/access/policies"));
	});

	test("viewers read the document only; load errors retry", async () => {
		const { routes } = await accessApi();
		let fail = true;
		renderApp(
			"/access/policies/ro",
			{
				...routes,
				"GET /iam/policies/ro": () =>
					fail
						? Response.json({ error: "Policy not found" }, { status: 404 })
						: routes["GET /iam/policies/ro"],
				"GET /iam/principals": { principals: [] },
			},
			viewerUser,
		);
		expect(await screen.findByText("Policy not found")).toBeTruthy();
		fail = false;
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		await waitFor(() => expect(editor().disabled).toBe(true));
		expect(screen.queryByRole("button", { name: "Save policy" })).toBeNull();
		expect(screen.queryByText("Principals")).toBeNull();
	});
});
