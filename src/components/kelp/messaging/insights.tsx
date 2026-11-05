import type { MessagingOverview, TopicDetail, TopicSummary } from "@shared/messaging.ts";
import { Link } from "@tanstack/react-router";
import { BarList, Columns, compact, Kpi, splitUnit } from "@/components/kelp/charts/index.ts";
import { Panel } from "@/components/kelp/page.tsx";
import { formatBytes, formatCount } from "@/lib/format.ts";
import { formatRetention } from "./retention.tsx";

const topicKey = (t: TopicSummary) => `${t.namespace}.${t.name}`;

function TopicLink({ topic }: { topic: TopicSummary }) {
	return (
		<Link
			to="/messaging/$namespace/$topic"
			params={{ namespace: topic.namespace, topic: topic.name }}
			className="font-mono hover:underline"
		>
			{topicKey(topic)}
		</Link>
	);
}

/** The longest retention window among topics that expire data, or null when none do. */
export function longestRetention(topics: TopicSummary[]): TopicSummary | null {
	return (
		[...topics]
			.filter((t) => t.retention.enabled && t.retention.seconds > 0)
			.sort((a, b) => b.retention.seconds - a.retention.seconds)[0] ?? null
	);
}

/** Headline numbers and the shape of the message queue: where partitions, messages and data sit. */
export function MessagingInsights({ data }: { data: MessagingOverview }) {
	const topics = data.topics;
	const partitions = topics.reduce((sum, t) => sum + t.partitionCount, 0);
	const messages = topics.reduce((sum, t) => sum + t.messageCount, 0);
	const stored = topics.reduce((sum, t) => sum + t.totalSize, 0);
	const expiring = topics.filter((t) => t.retention.enabled && t.retention.seconds > 0);
	const longest = longestRetention(topics);
	const namespaces = new Set(topics.map((t) => t.namespace)).size;
	const byPartitions = [...topics].sort((a, b) => b.partitionCount - a.partitionCount).slice(0, 6);
	const byMessages = [...topics]
		.filter((t) => t.messageCount > 0)
		.sort((a, b) => b.messageCount - a.messageCount)
		.slice(0, 6);
	return (
		<>
			<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
				<Kpi
					label="Topics"
					value={String(topics.length)}
					hint={`In ${namespaces} ${namespaces === 1 ? "namespace" : "namespaces"}`}
				/>
				<Kpi
					label="Partitions"
					value={String(partitions)}
					hint={
						topics.length
							? `${(partitions / topics.length).toFixed(1)} per topic on average`
							: "Create one to get started"
					}
				/>
				<Kpi label="Messages" value={compact(messages)} hint={`${formatCount(messages)} in all topics`} />
				<Kpi label="Stored" {...splitUnit(formatBytes(stored))} hint="Message data on disk" />
				<Kpi
					label="Brokers"
					value={String(data.brokers.length)}
					hint={data.leader ? "Leader elected" : "Electing a leader"}
					{...(data.leader ? {} : { tone: "warn" as const })}
				/>
				<Kpi
					label="Expiring data"
					value={`${expiring.length}/${topics.length}`}
					hint={
						longest ? `Longest keeps ${formatRetention(longest.retention)}` : "Every topic keeps data forever"
					}
				/>
			</div>
			<div className="mt-3 grid gap-3 xl:grid-cols-12 [&>*]:min-w-0">
				<Panel
					title="Partitions by topic"
					description="How each topic is spread over brokers"
					className="xl:col-span-4"
				>
					<BarList
						label="Partitions by topic"
						color="var(--data-1)"
						empty="Create a topic to see it here."
						items={byPartitions.map((t) => ({
							key: topicKey(t),
							label: <TopicLink topic={t} />,
							value: t.partitionCount,
							display: String(t.partitionCount),
						}))}
					/>
				</Panel>
				<Panel title="Busiest topics" description="Messages stored per topic" className="xl:col-span-4">
					<BarList
						label="Topics by messages"
						color="var(--data-2)"
						empty="No messages have been published yet."
						items={byMessages.map((t) => ({
							key: topicKey(t),
							label: <TopicLink topic={t} />,
							value: t.messageCount,
							display: compact(t.messageCount),
							extra: (
								<span className="w-16 text-right text-[12px] text-muted-foreground">
									{formatBytes(t.totalSize)}
								</span>
							),
						}))}
					/>
				</Panel>
				<Panel title="Retention" description="How long each topic keeps messages" className="xl:col-span-4">
					<BarList
						label="Retention by topic"
						color="var(--data-3)"
						empty="Create a topic to see it here."
						items={[...topics]
							.sort((a, b) => retentionWeight(b) - retentionWeight(a))
							.slice(0, 6)
							.map((t) => ({
								key: topicKey(t),
								label: <TopicLink topic={t} />,
								value: retentionWeight(t),
								display:
									t.retention.enabled && t.retention.seconds > 0 ? formatRetention(t.retention) : "Forever",
							}))}
					/>
				</Panel>
			</div>
		</>
	);
}

/** Retention as a bar length: topics that keep data forever draw as the longest. */
function retentionWeight(topic: TopicSummary): number {
	return topic.retention.enabled && topic.retention.seconds > 0 ? topic.retention.seconds : 365 * 86_400;
}

/**
 * How far each consumer group trails the data, in messages: per partition, the messages stored
 * minus the group's committed offset, summed. Partitions are matched by their order on the ring.
 */
export function consumerLag(topic: TopicDetail): Array<{ group: string; lag: number; partitions: number }> {
	const ordered = [...topic.partitions].sort((a, b) => a.rangeStart - b.rangeStart);
	const groups = new Map<string, { lag: number; partitions: number }>();
	for (const offset of topic.consumerGroupOffsets) {
		const partition = ordered[offset.partition] ?? ordered.find((p) => p.rangeStart === offset.partition);
		const lag = Math.max(0, (partition?.messageCount ?? 0) - offset.offset);
		const entry = groups.get(offset.consumerGroup) ?? { lag: 0, partitions: 0 };
		groups.set(offset.consumerGroup, { lag: entry.lag + lag, partitions: entry.partitions + 1 });
	}
	return [...groups.entries()].map(([group, v]) => ({ group, ...v })).sort((a, b) => b.lag - a.lag);
}

/** One topic at a glance: volume, clients, how evenly partitions fill, and consumer lag. */
export function TopicInsights({ topic }: { topic: TopicDetail }) {
	const ordered = [...topic.partitions].sort((a, b) => a.rangeStart - b.rangeStart);
	const lag = consumerLag(topic);
	const totalLag = lag.reduce((sum, g) => sum + g.lag, 0);
	const activePublishers = topic.publishers.filter((p) => p.active).length;
	const activeSubscribers = topic.subscribers.filter((s) => s.active).length;
	const counts = ordered.map((p) => p.messageCount);
	const mean = counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
	const skew = mean > 0 ? Math.max(...counts) / mean : null;
	return (
		<>
			<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
				<Kpi
					label="Messages"
					value={compact(topic.messageCount)}
					hint={`${formatCount(topic.messageCount)} stored`}
				/>
				<Kpi label="Stored" {...splitUnit(formatBytes(topic.totalSize))} hint="Across all partitions" />
				<Kpi
					label="Partitions"
					value={String(topic.partitions.length)}
					hint={skew === null ? "No messages yet" : `Busiest holds ${skew.toFixed(1)}× the average`}
					{...(skew !== null && skew > 2 ? { tone: "warn" as const } : {})}
				/>
				<Kpi
					label="Publishers"
					value={String(activePublishers)}
					hint={`${topic.publishers.length} known, ${activePublishers} active`}
				/>
				<Kpi
					label="Subscribers"
					value={String(activeSubscribers)}
					hint={`${topic.subscribers.length} known, ${activeSubscribers} active`}
				/>
				<Kpi
					label="Consumer lag"
					value={compact(totalLag)}
					unit="msgs"
					hint={
						lag.length
							? `Across ${lag.length} consumer ${lag.length === 1 ? "group" : "groups"}`
							: "No consumer groups yet"
					}
					{...(totalLag > 10_000 ? { tone: "warn" as const } : {})}
				/>
			</div>
			<div className="mt-3 grid gap-3 xl:grid-cols-12 [&>*]:min-w-0">
				<Panel
					title="Messages per partition"
					description="An even spread means keys hash well"
					className="xl:col-span-7"
				>
					{topic.messageCount > 0 ? (
						<Columns
							label="Messages per partition"
							height={160}
							color="var(--data-1)"
							columns={ordered.map((p, i) => ({ label: `P${i}`, value: p.messageCount }))}
						/>
					) : (
						<p className="flex h-40 items-center justify-center text-[13px] text-muted-foreground">
							No messages have been published to this topic yet.
						</p>
					)}
				</Panel>
				<Panel
					title="Consumer groups"
					description="Messages each group has yet to read"
					className="xl:col-span-5"
				>
					<BarList
						label="Consumer lag by group"
						color="var(--data-2)"
						empty="No consumer group has committed an offset yet."
						items={lag.map((g) => ({
							key: g.group,
							label: <span className="font-mono">{g.group}</span>,
							value: g.lag,
							display: compact(g.lag),
							extra: (
								<span className="w-20 text-right text-[12px] text-muted-foreground">
									{g.partitions} {g.partitions === 1 ? "partition" : "partitions"}
								</span>
							),
						}))}
					/>
				</Panel>
			</div>
		</>
	);
}
