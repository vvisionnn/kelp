import type { ClusterNode } from "./api.ts";

export interface TopicRetention {
	enabled: boolean;
	/** Retention window in seconds; 0 when disabled. */
	seconds: number;
}

export interface TopicSummary {
	namespace: string;
	name: string;
	partitionCount: number;
	messageCount: number;
	totalSize: number;
	retention: TopicRetention;
	createdAt: string | null;
	lastUpdated: string | null;
	/** Why the details could not be loaded, when only the name is known. */
	detailError?: string;
}

export interface MessagingOverview {
	brokers: ClusterNode[];
	/** The broker currently balancing partitions, when one has been elected. */
	leader: string | null;
	topics: TopicSummary[];
}

export interface TopicPartition {
	/** Start of the partition's slot range on the 2520-slot ring. */
	rangeStart: number;
	/** Exclusive end of the slot range. */
	rangeStop: number;
	leader: string;
	follower: string;
	messageCount: number;
	totalSize: number;
	lastDataAt: string | null;
	createdAt: string | null;
}

export interface TopicSchemaField {
	name: string;
	type: string;
	required: boolean;
}

export interface TopicPublisher {
	name: string;
	clientId: string;
	partition: number;
	broker: string;
	connectedAt: string | null;
	lastSeenAt: string | null;
	active: boolean;
	lastPublishedOffset: number;
	lastAckedOffset: number;
}

export interface TopicSubscriber {
	consumerGroup: string;
	consumerId: string;
	clientId: string;
	partition: number;
	broker: string;
	connectedAt: string | null;
	lastSeenAt: string | null;
	active: boolean;
	currentOffset: number;
	lastReceivedOffset: number;
}

export interface ConsumerGroupOffset {
	consumerGroup: string;
	partition: number;
	offset: number;
	updatedAt: string | null;
}

export interface TopicDetail extends TopicSummary {
	partitions: TopicPartition[];
	keySchema: TopicSchemaField[];
	valueSchema: TopicSchemaField[];
	publishers: TopicPublisher[];
	subscribers: TopicSubscriber[];
	consumerGroupOffsets: ConsumerGroupOffset[];
}

export interface CreateTopicRequest {
	namespace: string;
	name: string;
	partitionCount: number;
	retention: TopicRetention;
}
