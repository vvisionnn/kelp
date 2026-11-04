import { describe, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { renderApp } from "../../../test/render-app.tsx";
import { messagingApi, tablesApi } from "../../../test/streams-fixtures.ts";

/** A response that stays pending until released, so the loading state can be seen. */
function held<T>(value: T) {
	let release: () => void = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	return {
		respond: async () => {
			await gate;
			return value;
		},
		release: () => release(),
	};
}

describe("loading states", () => {
	test("every messaging and tables page shows a tide skeleton, then its data", async () => {
		const { overview, orders } = await messagingApi();
		const tables = await tablesApi();
		const pages: Array<[string, string, unknown, string, string]> = [
			["/messaging", "GET /messaging", overview, "Loading messaging", "127.0.0.1:17778"],
			[
				"/messaging/orders/created",
				"GET /messaging/topics/orders/created",
				orders,
				"Loading topic",
				"1890–2519",
			],
			["/tables", "GET /tables/buckets", tables.list, "Loading table buckets", "Connect a query engine"],
			[
				"/tables/analytics",
				"GET /tables/buckets/analytics",
				tables.detail,
				"Loading table bucket",
				"page_views",
			],
			[
				"/tables/analytics/sales/orders",
				"GET /tables/buckets/analytics/namespaces/sales/tables/orders",
				tables.orders,
				"Loading table",
				"placed_at",
			],
		];
		for (const [path, route, value, label, ready] of pages) {
			const response = held(value);
			const view = renderApp(path, {
				[route]: response.respond,
				"GET /system/config": { kelp: { s3Endpoint: null } },
			});
			const skeleton = await screen.findByRole("status", { name: label });
			expect(skeleton.querySelector(".tide")).toBeTruthy();
			response.release();
			expect(await screen.findByText(ready)).toBeTruthy();
			view.unmount();
		}
	});
});
