import type { MessagingOverview, TopicDetail } from "@shared/messaging.ts";
import type { TableBucketDetail, TableBucketList, TableDetail, TablePreview } from "@shared/tables.ts";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { api } from "./api.ts";

const LIVE = 15_000;

/** Query definitions for messaging and S3 Tables pages. */
export const streamsQueries = {
	messaging: () =>
		queryOptions({
			queryKey: ["messaging"],
			queryFn: () => api.get<MessagingOverview>("/messaging"),
			refetchInterval: LIVE,
		}),
	topic: (namespace: string, topic: string) =>
		queryOptions({
			queryKey: ["messaging", "topic", namespace, topic],
			queryFn: () =>
				api.get<TopicDetail>(
					`/messaging/topics/${encodeURIComponent(namespace)}/${encodeURIComponent(topic)}`,
				),
			refetchInterval: LIVE,
		}),
	/** Kelp's own settings; the S3 endpoint tells engines where the Iceberg catalog lives. */
	kelpEndpoints: () =>
		queryOptions({
			queryKey: ["system", "config"],
			queryFn: () => api.get<{ kelp: { s3Endpoint: string | null } }>("/system/config"),
			staleTime: 5 * 60_000,
		}),
	tableBuckets: () =>
		queryOptions({
			queryKey: ["tables", "buckets"],
			queryFn: () => api.get<TableBucketList>("/tables/buckets"),
		}),
	tableBucket: (bucket: string) =>
		queryOptions({
			queryKey: ["tables", "bucket", bucket],
			queryFn: () => api.get<TableBucketDetail>(`/tables/buckets/${encodeURIComponent(bucket)}`),
		}),
	table: (bucket: string, namespace: string, table: string) =>
		queryOptions({
			queryKey: ["tables", "table", bucket, namespace, table],
			queryFn: () => api.get<TableDetail>(tablePath(bucket, namespace, table)),
		}),
	preview: (
		bucket: string,
		namespace: string,
		table: string,
		options: { snapshot?: string; file?: string },
	) =>
		queryOptions({
			queryKey: [
				"tables",
				"preview",
				bucket,
				namespace,
				table,
				options.snapshot ?? null,
				options.file ?? null,
			],
			queryFn: () =>
				api.get<TablePreview>(`${tablePath(bucket, namespace, table)}/preview`, {
					snapshot: options.snapshot,
					file: options.file,
					limit: 50,
				}),
			placeholderData: keepPreviousData,
			staleTime: 60_000,
		}),
};

export function tablePath(bucket: string, namespace: string, table: string): string {
	return `/tables/buckets/${encodeURIComponent(bucket)}/namespaces/${encodeURIComponent(namespace)}/tables/${encodeURIComponent(table)}`;
}
