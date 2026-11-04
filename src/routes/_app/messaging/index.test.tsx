import { describe, expect, mock, test } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderApp, viewerUser } from "../../../../test/render-app.tsx";
import { settle } from "../../../../test/settle.ts";
import { messagingApi } from "../../../../test/streams-fixtures.ts";

describe("messaging page", () => {
	test("shows totals, brokers with the leader, and topics", async () => {
		const { overview } = await messagingApi();
		const app = renderApp("/messaging", { "GET /messaging": overview });
		expect(await screen.findByText("127.0.0.1:17778")).toBeTruthy();
		expect(screen.getByLabelText("Leader")).toBeTruthy();
		expect(screen.getByText("The crowned broker balances partitions.")).toBeTruthy();
		const table = screen.getByRole("table");
		expect(within(table).getByText("created")).toBeTruthy();
		expect(within(table).getByText("1 week")).toBeTruthy();
		expect(within(table).getByText("1 hour")).toBeTruthy();
		fireEvent.change(screen.getByLabelText("Search topics"), { target: { value: "telemetry" } });
		expect(within(table).queryByText("created")).toBeNull();
		fireEvent.click(within(table).getByText("cpu"));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/messaging/telemetry/cpu"));
	});

	test("explains how to start a broker when none runs", async () => {
		renderApp("/messaging", { "GET /messaging": { brokers: [], leader: null, topics: [] } });
		expect(await screen.findByText("No message broker is running")).toBeTruthy();
		expect(screen.getByText("weed mq.broker -master=<master-host>:9333")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Create topic" })).toBeNull();
	});

	test("shows an empty topic list, an electing leader, and topics without details", async () => {
		const { overview } = await messagingApi();
		renderApp("/messaging", {
			"GET /messaging": {
				...overview,
				leader: null,
				topics: [
					{
						...overview.topics[0],
						retention: { enabled: false, seconds: 0 },
						detailError: "boom",
					},
				],
			},
		});
		expect(await screen.findByText("Brokers are electing a leader.")).toBeTruthy();
		expect(screen.getByLabelText("Details unavailable")).toBeTruthy();
		expect(within(screen.getByRole("table")).getByText("Keep forever")).toBeTruthy();
	});

	test("an empty broker has no topics yet", async () => {
		const { overview } = await messagingApi();
		renderApp("/messaging", { "GET /messaging": { ...overview, topics: [] } });
		expect(await screen.findByText("No topics yet")).toBeTruthy();
	});

	test("creates a topic and opens it", async () => {
		const { overview, orders } = await messagingApi();
		const create = mock(() => Response.json({ namespace: "billing", name: "invoices" }, { status: 201 }));
		const app = renderApp("/messaging", {
			"GET /messaging": overview,
			"POST /messaging/topics": create,
			"GET /messaging/topics/billing/invoices": { ...orders, namespace: "billing", name: "invoices" },
		});
		fireEvent.click(await screen.findByRole("button", { name: "Create topic" }));
		const dialog = await screen.findByRole("dialog");
		fireEvent.change(within(dialog).getByLabelText("Namespace"), { target: { value: "bad name" } });
		expect(within(dialog).getByText("Names use letters, digits, dots, dashes and underscores.")).toBeTruthy();
		fireEvent.change(within(dialog).getByLabelText("Namespace"), { target: { value: "billing" } });
		fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "invoices" } });
		fireEvent.change(within(dialog).getByLabelText("Partitions"), { target: { value: "3" } });
		fireEvent.change(within(dialog).getByLabelText("Keep messages for"), { target: { value: "2" } });
		fireEvent.click(within(dialog).getByRole("button", { name: "days" }));
		fireEvent.click(within(dialog).getByRole("button", { name: "Create topic" }));
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/messaging/billing/invoices"));
		expect(app.api.last("POST", "/messaging/topics")?.body).toEqual({
			namespace: "billing",
			name: "invoices",
			partitionCount: 3,
			retention: { enabled: true, seconds: 172800 },
		});
		expect(await screen.findByText("Topic billing.invoices created")).toBeTruthy();
	});

	test("topics can keep messages forever", async () => {
		const { overview } = await messagingApi();
		const app = renderApp("/messaging", {
			"GET /messaging": overview,
			"POST /messaging/topics": () => Response.json({ error: "Topic a.b already exists" }, { status: 409 }),
		});
		fireEvent.click(await screen.findByRole("button", { name: "Create topic" }));
		const dialog = await screen.findByRole("dialog");
		fireEvent.change(within(dialog).getByLabelText("Namespace"), { target: { value: "a" } });
		fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "b" } });
		fireEvent.click(within(dialog).getByRole("switch"));
		fireEvent.click(within(dialog).getByRole("button", { name: "Create topic" }));
		expect(await screen.findByText("Topic a.b already exists")).toBeTruthy();
		expect(app.api.last("POST", "/messaging/topics")?.body).toMatchObject({
			retention: { enabled: false, seconds: 0 },
		});
		fireEvent.keyDown(dialog, { key: "Escape" });
		await settle(300);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	test("purges expired data after confirming", async () => {
		const { overview } = await messagingApi();
		const app = renderApp("/messaging", {
			"GET /messaging": overview,
			"POST /messaging/retention/purge": { ok: true },
		});
		fireEvent.click(await screen.findByRole("button", { name: "Purge expired data" }));
		fireEvent.click(
			within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Purge expired data" }),
		);
		expect(await screen.findByText("Expired messages purged")).toBeTruthy();
		expect(app.api.last("POST", "/messaging/retention/purge")).toBeTruthy();
	});

	test("viewers see topics without write actions", async () => {
		const { overview } = await messagingApi();
		renderApp("/messaging", { "GET /messaging": overview }, viewerUser);
		expect(await screen.findByText("127.0.0.1:17778")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Create topic" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Purge expired data" })).toBeNull();
	});

	test("explains failures and retries", async () => {
		const { overview } = await messagingApi();
		let fail = true;
		renderApp("/messaging", {
			"GET /messaging": () =>
				fail ? Response.json({ error: "grpc down", upstream: "grpc" }, { status: 502 }) : overview,
		});
		expect(await screen.findByText("SeaweedFS grpc reported a problem")).toBeTruthy();
		fail = false;
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(await screen.findByText("127.0.0.1:17778")).toBeTruthy();
	});
});
