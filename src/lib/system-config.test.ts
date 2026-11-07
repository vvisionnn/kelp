import { afterEach, describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { accessQueries } from "./access-queries.ts";
import { maintenanceQueries } from "./maintenance-queries.ts";
import { objectQueries } from "./objects-queries.ts";
import { streamsQueries } from "./streams-queries.ts";

const realFetch = globalThis.fetch;
const CONFIG = { masterAddress: "m:9333", kelp: { version: "1", s3Endpoint: "https://s3.example" } };

afterEach(() => {
	globalThis.fetch = realFetch;
});

/** What a component would see from `useQuery(options)`, `select` included. */
async function read<T>(client: QueryClient, options: object): Promise<T> {
	const observer = new QueryObserver(client, options as never);
	const result = await observer.refetch();
	return result.data as T;
}

describe("Kelp's system config", () => {
	test("every page reads it in its own shape, whichever page asked first", async () => {
		globalThis.fetch = mock(async () => Response.json(CONFIG)) as unknown as typeof fetch;
		const client = new QueryClient();
		// Files first (it only wants the endpoint), then Tables, Settings and the key dialogs.
		expect(await read<string>(client, objectQueries.s3Endpoint())).toBe("https://s3.example");
		await client.prefetchQuery(objectQueries.s3Endpoint());
		const tables = client.getQueryData(streamsQueries.kelpEndpoints().queryKey);
		expect(tables?.kelp.s3Endpoint).toBe("https://s3.example");
		expect((await read<typeof CONFIG>(client, maintenanceQueries.systemConfig())).masterAddress).toBe(
			"m:9333",
		);
		expect(await read<string>(client, accessQueries.s3Endpoint())).toBe("https://s3.example");
	});
});
