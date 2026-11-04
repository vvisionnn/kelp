import type { RecordedRequest } from "./fake-upstream.ts";
import type { Harness } from "./harness.ts";

const FIXTURES = `${import.meta.dir}/../fixtures/tables`;
export const ANALYTICS_ARN = "arn:aws:s3tables:us-east-1:kelp-dev:bucket/analytics";
export const ORDERS_ARN = `${ANALYTICS_ARN}/table/sales/orders`;

/** Serves a captured file, honoring `Range: bytes=a-b` like the filer does. */
async function serveFile(path: string, request: Request): Promise<Response> {
	const file = Bun.file(path);
	if (!(await file.exists())) return new Response("not found", { status: 404 });
	const bytes = await file.bytes();
	const range = /bytes=(\d+)-(\d+)/.exec(request.headers.get("range") ?? "");
	if (!range) return new Response(bytes);
	return new Response(bytes.slice(Number(range[1]), Number(range[2]) + 1), { status: 206 });
}

/**
 * Wires the harness to the captured `analytics` table bucket: admin S3 Tables endpoints answer
 * with real fixtures, and the filer serves the `orders` table's entry, metadata and data files.
 */
export function useAnalyticsFixtures(h: Harness) {
	h.admin.fixture("GET /api/s3tables/buckets", "tables/buckets");
	h.admin.fixture("GET /api/s3tables/namespaces", "tables/namespaces");
	h.admin.fixture("GET /api/s3tables/tables", "tables/tables");
	h.admin.on("GET /api/s3tables/tags", async (_request: Request, recorded: RecordedRequest) =>
		Response.json(
			await Bun.file(
				`${FIXTURES}/${recorded.query.arn === ORDERS_ARN ? "table-tags" : "bucket-tags"}.json`,
			).json(),
		),
	);
	h.admin.fixture("GET /api/s3tables/bucket-policy", "tables/bucket-policy");
	h.admin.on("GET /api/s3tables/table-policy", async (_request: Request, recorded: RecordedRequest) =>
		Response.json(
			await Bun.file(
				`${FIXTURES}/${recorded.query.name === "orders" ? "table-policy" : "table-policy-empty"}.json`,
			).json(),
		),
	);
	h.filer.on("GET *", async (request: Request, recorded: RecordedRequest) => {
		const entries: Record<string, string> = {
			"/buckets/analytics/sales/orders": "entry-orders",
			"/buckets/analytics/finance/invoices": "entry-invoices",
			"/buckets/analytics/web/page_views": "entry-page-views",
		};
		const entry = entries[recorded.path];
		if (entry && recorded.query.metadata === "true")
			return Response.json(await Bun.file(`${FIXTURES}/${entry}.json`).json());
		const prefix = "/buckets/analytics/sales/orders/";
		if (recorded.path.startsWith(prefix))
			return serveFile(`${FIXTURES}/orders/${recorded.path.slice(prefix.length)}`, request);
		return new Response("not found", { status: 404 });
	});
}
