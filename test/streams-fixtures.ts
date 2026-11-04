import type { MessagingOverview, TopicDetail } from "@shared/messaging.ts";
import type { TableBucketDetail, TableBucketList, TableDetail, TablePreview } from "@shared/tables.ts";
import { mapIcebergMetadata, parseIcebergJson } from "../server/iceberg/metadata.ts";
import { type FileReader, previewTable } from "../server/iceberg/preview.ts";
import { mapTopicDetail, mapTopicSummary } from "../server/map/messaging.ts";
import type { Raw } from "../server/map/raw.ts";
import {
	catalogOnlyTable,
	catalogRecord,
	mapNamespace,
	mapTableBucket,
	mapTableSummary,
} from "../server/map/tables.ts";

const FIXTURES = `${import.meta.dir}/../fixtures`;
const json = <T = Raw>(name: string): Promise<T> => Bun.file(`${FIXTURES}/${name}.json`).json() as Promise<T>;

export const BROKER = {
	address: "127.0.0.1:17777",
	version: "4.52 984eac6",
	dataCenter: "",
	rack: "",
	createdAt: null,
};

/** Messaging API responses built from real SeaweedFS fixtures through the server's mappers. */
export async function messagingApi() {
	const orders = mapTopicDetail(await json("mq/topic-orders-created"));
	const cpu = await json("mq/topic-telemetry-cpu");
	const overview: MessagingOverview = {
		brokers: [BROKER, { ...BROKER, address: "127.0.0.1:17778" }],
		leader: BROKER.address,
		topics: [mapTopicSummary(await json("mq/topic-orders-created")), mapTopicSummary(cpu)],
	};
	const busy: TopicDetail = {
		...orders,
		messageCount: 1200,
		keySchema: [{ name: "order_id", type: "INT64", required: true }],
		valueSchema: [{ name: "payload", type: "BYTES", required: false }],
		publishers: [
			{
				name: "checkout-api",
				clientId: "c-1",
				partition: 0,
				broker: BROKER.address,
				connectedAt: "2026-11-04T10:00:00.000Z",
				lastSeenAt: "2026-11-04T10:05:00.000Z",
				active: true,
				lastPublishedOffset: 1200,
				lastAckedOffset: 1199,
			},
		],
		subscribers: [
			{
				consumerGroup: "billing",
				consumerId: "",
				clientId: "c-2",
				partition: 0,
				broker: BROKER.address,
				connectedAt: null,
				lastSeenAt: null,
				active: false,
				currentOffset: 900,
				lastReceivedOffset: 950,
			},
		],
		consumerGroupOffsets: [{ consumerGroup: "billing", partition: 0, offset: 900, updatedAt: null }],
	};
	return { overview, orders, busy };
}

const ORDERS_ROOT = `${FIXTURES}/tables/orders`;

/** S3 Tables API responses built from the captured `analytics` table bucket. */
export async function tablesApi() {
	const bucketsRaw = await json("tables/buckets");
	const list: TableBucketList = {
		buckets: (bucketsRaw.buckets as Raw[]).map(mapTableBucket),
		icebergPort: Number(bucketsRaw.iceberg_port),
	};
	const bucket = list.buckets[0];
	if (!bucket) throw new Error("fixture has no bucket");
	const tables = ((await json("tables/tables")).tables as Raw[]).map(mapTableSummary);
	const detail: TableBucketDetail = {
		bucket,
		namespaces: ((await json("tables/namespaces")).namespaces as Raw[]).map(mapNamespace),
		tables,
		tags: { team: "data" },
		policy: String((await json("tables/bucket-policy")).policy),
	};
	const iceberg = mapIcebergMetadata(
		parseIcebergJson(await Bun.file(`${ORDERS_ROOT}/metadata/v4.metadata.json`).text()),
	);
	const ordersSummary = tables.find((t) => t.name === "orders");
	const invoicesSummary = tables.find((t) => t.name === "invoices");
	if (!ordersSummary || !invoicesSummary) throw new Error("fixture tables missing");
	const record = catalogRecord(await json("tables/entry-orders"));
	const orders: TableDetail = {
		table: ordersSummary,
		bucket: "analytics",
		owner: record.owner,
		versionToken: record.versionToken,
		tags: { owner: "sales-ops", pii: "false" },
		policy: String((await json("tables/table-policy")).policy),
		iceberg,
		metadataError: null,
	};
	const invoices: TableDetail = {
		...orders,
		table: invoicesSummary,
		tags: {},
		policy: "",
		iceberg: catalogOnlyTable(catalogRecord(await json("tables/entry-invoices")).simpleFields),
	};
	const reader: FileReader = {
		async read(path, range) {
			const bytes = await Bun.file(
				`${ORDERS_ROOT}/${path.replace("/buckets/analytics/sales/orders/", "")}`,
			).bytes();
			return range ? bytes.slice(range.start, range.end + 1) : bytes;
		},
	};
	const preview: TablePreview = await previewTable(reader, iceberg, { limit: 5 });
	return { list, detail, orders, invoices, preview };
}
