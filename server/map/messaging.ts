import type {
	TopicDetail,
	TopicPartition,
	TopicRetention,
	TopicSchemaField,
	TopicSummary,
} from "../../shared/messaging.ts";
import { bool, list, num, obj, type Raw, str, time } from "./raw.ts";

/** SeaweedMQ spreads partitions over a ring of 2520 slots. */
export const PARTITION_RING = 2520;

export function mapRetention(raw: unknown): TopicRetention {
	const retention = obj(raw);
	const enabled = bool(retention.enabled);
	return { enabled, seconds: enabled ? num(retention.retention_seconds) : 0 };
}

function schemaFields(raw: unknown): TopicSchemaField[] {
	return list(raw).map((f) => ({ name: str(f.name), type: str(f.type), required: bool(f.required) }));
}

function partitions(raw: unknown): TopicPartition[] {
	const items = list(raw).sort((a, b) => num(a.id) - num(b.id));
	return items.map((p, index) => ({
		rangeStart: num(p.id),
		rangeStop: index + 1 < items.length ? num(items[index + 1]?.id) : PARTITION_RING,
		leader: str(p.leader_broker),
		follower: str(p.follower_broker),
		messageCount: num(p.message_count),
		totalSize: num(p.total_size),
		lastDataAt: time(p.last_data_time),
		createdAt: time(p.created_at),
	}));
}

/** Maps the admin's topic details into a summary row. */
export function mapTopicSummary(raw: Raw): TopicSummary {
	return {
		namespace: str(raw.namespace),
		name: str(raw.name),
		partitionCount: list(raw.partitions).length,
		messageCount: num(raw.message_count),
		totalSize: num(raw.total_size),
		retention: mapRetention(raw.retention),
		createdAt: time(raw.created_at),
		lastUpdated: time(raw.last_updated),
	};
}

export function mapTopicDetail(raw: Raw): TopicDetail {
	return {
		...mapTopicSummary(raw),
		partitions: partitions(raw.partitions),
		keySchema: schemaFields(raw.key_schema),
		valueSchema: schemaFields(raw.value_schema),
		publishers: list(raw.publishers).map((p) => ({
			name: str(p.publisher_name),
			clientId: str(p.client_id),
			partition: num(p.partition_id),
			broker: str(p.broker),
			connectedAt: time(p.connect_time),
			lastSeenAt: time(p.last_seen_time),
			active: bool(p.is_active),
			lastPublishedOffset: num(p.last_published_offset),
			lastAckedOffset: num(p.last_acked_offset),
		})),
		subscribers: list(raw.subscribers).map((s) => ({
			consumerGroup: str(s.consumer_group),
			consumerId: str(s.consumer_id),
			clientId: str(s.client_id),
			partition: num(s.partition_id),
			broker: str(s.broker),
			connectedAt: time(s.connect_time),
			lastSeenAt: time(s.last_seen_time),
			active: bool(s.is_active),
			currentOffset: num(s.current_offset),
			lastReceivedOffset: num(s.last_received_offset),
		})),
		consumerGroupOffsets: list(raw.consumer_group_offsets).map((o) => ({
			consumerGroup: str(o.consumer_group),
			partition: num(o.partition_id),
			offset: num(o.offset),
			updatedAt: time(o.last_updated),
		})),
	};
}
