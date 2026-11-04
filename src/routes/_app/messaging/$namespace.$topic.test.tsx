import { describe, expect, test } from "bun:test";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { setMedia } from "../../../../test/media.ts";
import { renderApp, viewerUser } from "../../../../test/render-app.tsx";
import { messagingApi } from "../../../../test/streams-fixtures.ts";

describe("topic page", () => {
	test("draws the partition ring and lists partitions", async () => {
		const { orders } = await messagingApi();
		renderApp("/messaging/orders/created", { "GET /messaging/topics/orders/created": orders });
		expect(await screen.findByRole("img", { name: "4 partitions across 1 broker" })).toBeTruthy();
		expect(screen.getAllByTestId("partition-arc")).toHaveLength(4);
		expect(screen.getByText("1890–2519")).toBeTruthy();
		expect(screen.getAllByText("Never")).toHaveLength(4);
		expect(screen.getByText("No schema registered. Messages are stored as raw bytes.")).toBeTruthy();
		expect(
			screen.getByText("Nobody is publishing. Publishers appear while they are connected."),
		).toBeTruthy();
	});

	test("shows schema, publishers, subscribers and offsets", async () => {
		const { busy } = await messagingApi();
		renderApp("/messaging/orders/created", { "GET /messaging/topics/orders/created": busy });
		expect(await screen.findByText("order_id")).toBeTruthy();
		expect(screen.getByText("int64")).toBeTruthy();
		expect(screen.getByText("payload")).toBeTruthy();
		expect(screen.getByText("checkout-api")).toBeTruthy();
		fireEvent.click(screen.getByRole("tab", { name: "Subscribers 1" }));
		expect(await screen.findByText("c-2")).toBeTruthy();
		expect(screen.getByText("900 / 950")).toBeTruthy();
		fireEvent.click(screen.getByRole("tab", { name: "Offsets 1" }));
		expect(await screen.findByText("900")).toBeTruthy();
	});

	test("a key-only schema and recent writes", async () => {
		const { busy } = await messagingApi();
		renderApp("/messaging/orders/created", {
			"GET /messaging/topics/orders/created": {
				...busy,
				valueSchema: [],
				partitions: busy.partitions.map((p, i) =>
					i === 0 ? { ...p, lastDataAt: new Date(Date.now() - 120_000).toISOString() } : p,
				),
			},
		});
		expect(await screen.findByText("Raw bytes")).toBeTruthy();
		expect(screen.getByText("2 min ago")).toBeTruthy();
	});

	test("a value-only schema", async () => {
		const { busy } = await messagingApi();
		renderApp("/messaging/orders/created", {
			"GET /messaging/topics/orders/created": { ...busy, keySchema: [] },
		});
		expect(await screen.findByText("payload")).toBeTruthy();
		expect(screen.getByText("Raw bytes")).toBeTruthy();
	});

	test("hovering a partition shows its slots and traffic", async () => {
		const { busy } = await messagingApi();
		setMedia("(prefers-reduced-motion: reduce)", false);
		renderApp("/messaging/orders/created", { "GET /messaging/topics/orders/created": busy });
		const arcs = await screen.findAllByTestId("partition-arc");
		fireEvent.pointerEnter(arcs[1] as Element);
		expect((await screen.findAllByText("630–1259")).length).toBe(2);
		fireEvent.pointerLeave(arcs[1] as Element);
		expect(screen.getByText("partitions")).toBeTruthy();
	});

	test("changes retention", async () => {
		const { orders } = await messagingApi();
		const app = renderApp("/messaging/orders/created", {
			"GET /messaging/topics/orders/created": orders,
			"PUT /messaging/topics/orders/created/retention": { ok: true },
		});
		const save = await screen.findByRole("button", { name: "Save retention" });
		expect((save as HTMLButtonElement).disabled).toBe(true);
		fireEvent.change(screen.getByLabelText("Keep messages for"), { target: { value: "36" } });
		fireEvent.click(screen.getByRole("button", { name: "hours" }));
		fireEvent.click(screen.getByRole("button", { name: "Discard" }));
		expect((screen.getByLabelText("Keep messages for") as HTMLInputElement).value).toBe("1");
		fireEvent.change(screen.getByLabelText("Keep messages for"), { target: { value: "36" } });
		fireEvent.click(screen.getByRole("button", { name: "hours" }));
		fireEvent.click(save);
		expect(await screen.findByText("Retention for orders.created saved")).toBeTruthy();
		expect(app.api.last("PUT", "/messaging/topics/orders/created/retention")?.body).toEqual({
			enabled: true,
			seconds: 129600,
		});
	});

	test("viewers cannot change retention", async () => {
		const { orders } = await messagingApi();
		renderApp("/messaging/orders/created", { "GET /messaging/topics/orders/created": orders }, viewerUser);
		expect(await screen.findByText("Only administrators can change retention.")).toBeTruthy();
	});

	test("missing topics explain themselves", async () => {
		const app = renderApp("/messaging/nope/none", {
			"GET /messaging/topics/nope/none": () =>
				Response.json({ error: "Topic nope.none does not exist", upstream: "admin" }, { status: 404 }),
		});
		expect(await screen.findByText("Topic nope.none does not exist")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(await screen.findByText("Topic nope.none does not exist")).toBeTruthy();
		const back = screen.getByRole("link", { name: "All topics" });
		fireEvent.click(back);
		await waitFor(() => expect(app.router.state.location.pathname).toBe("/messaging"));
	});
});
