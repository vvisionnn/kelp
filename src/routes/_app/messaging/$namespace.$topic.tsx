import type {
	ConsumerGroupOffset,
	TopicDetail,
	TopicPartition,
	TopicPublisher,
	TopicSchemaField,
	TopicSubscriber,
} from "@shared/messaging.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, HardDrive, Inbox, Send, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import { PartitionRing } from "@/components/kelp/messaging/partition-ring.tsx";
import {
	draftFrom,
	formatRetention,
	type RetentionDraft,
	RetentionFields,
	retentionFrom,
} from "@/components/kelp/messaging/retention.tsx";
import {
	EmptyState,
	ErrorState,
	PageHeader,
	Panel,
	Reveal,
	SkeletonBlock,
	StatTile,
	StatusDot,
} from "@/components/kelp/page.tsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api.ts";
import { formatBytes, formatCount, formatRelative } from "@/lib/format.ts";
import { useAction } from "@/lib/mutations.ts";
import { useCanWrite } from "@/lib/session.ts";
import { streamsQueries } from "@/lib/streams-queries.ts";

export const Route = createFileRoute("/_app/messaging/$namespace/$topic")({
	staticData: {
		section: "Operations",
		title: "Messaging",
		crumb: ({ namespace, topic }) => `${namespace}.${topic}`,
	},
	loader: ({ context, params }) => {
		// Prefetch without blocking: the page renders at once and its skeleton gives way to data.
		void context.queryClient.prefetchQuery(streamsQueries.topic(params.namespace, params.topic));
	},
	component: TopicPage,
});

function TopicPage() {
	const { namespace, topic } = Route.useParams();
	const { data, isPending, error, refetch } = useQuery(streamsQueries.topic(namespace, topic));

	return (
		<>
			<PageHeader
				title={`${namespace}.${topic}`}
				description={
					<Link to="/messaging" className="inline-flex items-center gap-1 hover:text-foreground">
						<ArrowLeft className="size-3.5" />
						All topics
					</Link>
				}
			/>
			{isPending ? (
				<TopicSkeleton />
			) : error ? (
				<ErrorState error={error} onRetry={() => refetch()} />
			) : (
				<TopicBody topic={data} />
			)}
		</>
	);
}

function TopicBody({ topic }: { topic: TopicDetail }) {
	return (
		<Reveal className="space-y-6">
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<StatTile label="Messages" value={topic.messageCount} icon={<Inbox />} />
				<StatTile label="Stored" value={topic.totalSize} format={formatBytes} icon={<HardDrive />} />
				<StatTile label="Publishers" value={topic.publishers.length} icon={<Send />} />
				<StatTile label="Subscribers" value={topic.subscribers.length} icon={<Users />} />
			</div>
			<div className="grid items-start gap-4 lg:grid-cols-[1.3fr_1fr]">
				<Panel title="Partitions" description="Each partition owns a slice of the 2,520-slot key ring.">
					<PartitionRing partitions={topic.partitions} />
				</Panel>
				<RetentionPanel topic={topic} />
			</div>
			<Panel title="Partition details">
				<DataTable
					data={topic.partitions}
					columns={partitionColumns}
					getRowId={(p) => String(p.rangeStart)}
					empty={
						<EmptyState
							icon={<Inbox />}
							title="No partitions"
							description="The broker has not assigned any yet."
						/>
					}
				/>
			</Panel>
			<div className="grid items-start gap-4 lg:grid-cols-[1fr_1.6fr]">
				<SchemaPanel keys={topic.keySchema} values={topic.valueSchema} />
				<ClientsPanel topic={topic} />
			</div>
		</Reveal>
	);
}

function RetentionPanel({ topic }: { topic: TopicDetail }) {
	const canWrite = useCanWrite();
	const [draft, setDraft] = useState<RetentionDraft>(() => draftFrom(topic.retention));
	const saved = draftFrom(topic.retention);
	// Refetches bring the saved value back in; follow it unless the user is mid-edit.
	const savedKey = `${topic.retention.enabled}:${topic.retention.seconds}`;
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the saved value changes.
	useEffect(() => setDraft(draftFrom(topic.retention)), [savedKey]);
	const next = retentionFrom(draft);
	const dirty = next.enabled !== topic.retention.enabled || next.seconds !== topic.retention.seconds;
	const save = useAction({
		run: () =>
			api.put(
				`/messaging/topics/${encodeURIComponent(topic.namespace)}/${encodeURIComponent(topic.name)}/retention`,
				next,
			),
		success: `Retention for ${topic.namespace}.${topic.name} saved`,
		invalidate: [["messaging"]],
	});

	return (
		<Panel title="Retention" description={`Currently: ${formatRetention(topic.retention)}.`}>
			{canWrite ? (
				<form
					className="grid gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						save.mutate();
					}}
				>
					<RetentionFields draft={draft} onChange={setDraft} disabled={save.isPending} />
					<div className="flex justify-end gap-2">
						{dirty && (
							<Button type="button" variant="ghost" onClick={() => setDraft(saved)}>
								Discard
							</Button>
						)}
						<Button type="submit" disabled={!dirty || save.isPending}>
							{save.isPending && <Spinner />}
							Save retention
						</Button>
					</div>
				</form>
			) : (
				<p className="text-muted-foreground text-sm">Only administrators can change retention.</p>
			)}
		</Panel>
	);
}

function SchemaFields({ fields }: { fields: TopicSchemaField[] }) {
	return (
		<ul className="divide-y text-sm">
			{fields.map((field) => (
				<li key={field.name} className="flex items-center justify-between gap-3 py-2">
					<span className="font-mono">{field.name}</span>
					<span className="flex items-center gap-2">
						<Badge variant="outline" className="font-mono">
							{field.type.toLowerCase()}
						</Badge>
						{field.required && <Badge variant="secondary">required</Badge>}
					</span>
				</li>
			))}
		</ul>
	);
}

function SchemaPanel({ keys, values }: { keys: TopicSchemaField[]; values: TopicSchemaField[] }) {
	return (
		<Panel title="Schema" description="Record types registered for keys and values.">
			{keys.length || values.length ? (
				<div className="grid gap-4">
					<div>
						<h3 className="mb-1 text-muted-foreground text-xs">Key</h3>
						{keys.length ? (
							<SchemaFields fields={keys} />
						) : (
							<p className="text-muted-foreground text-sm">Raw bytes</p>
						)}
					</div>
					<div>
						<h3 className="mb-1 text-muted-foreground text-xs">Value</h3>
						{values.length ? (
							<SchemaFields fields={values} />
						) : (
							<p className="text-muted-foreground text-sm">Raw bytes</p>
						)}
					</div>
				</div>
			) : (
				<p className="text-muted-foreground text-sm">
					No schema registered. Messages are stored as raw bytes.
				</p>
			)}
		</Panel>
	);
}

const quiet = (text: string) => <p className="py-6 text-center text-muted-foreground text-sm">{text}</p>;

function ClientsPanel({ topic }: { topic: TopicDetail }) {
	return (
		<Panel
			title="Clients"
			description="Who is reading and writing right now, and where consumer groups will resume."
		>
			<Tabs defaultValue="publishers">
				<TabsList variant="line" className="mb-3">
					<TabsTrigger value="publishers">Publishers {topic.publishers.length}</TabsTrigger>
					<TabsTrigger value="subscribers">Subscribers {topic.subscribers.length}</TabsTrigger>
					<TabsTrigger value="offsets">Offsets {topic.consumerGroupOffsets.length}</TabsTrigger>
				</TabsList>
				<TabsContent value="publishers">
					<DataTable
						data={topic.publishers}
						columns={publisherColumns}
						getRowId={(p) => `${p.clientId}-${p.partition}`}
						empty={quiet("Nobody is publishing. Publishers appear while they are connected.")}
					/>
				</TabsContent>
				<TabsContent value="subscribers">
					<DataTable
						data={topic.subscribers}
						columns={subscriberColumns}
						getRowId={(s) => `${s.consumerGroup}-${s.consumerId}-${s.partition}`}
						empty={quiet("Nobody is subscribed. Subscribers appear while they are connected.")}
					/>
				</TabsContent>
				<TabsContent value="offsets">
					<DataTable
						data={topic.consumerGroupOffsets}
						columns={offsetColumns}
						getRowId={(o) => `${o.consumerGroup}-${o.partition}`}
						empty={quiet("No committed offsets. Consumer groups commit offsets as they read.")}
					/>
				</TabsContent>
			</Tabs>
		</Panel>
	);
}

const partitionColumns: Array<Column<TopicPartition>> = [
	{
		accessorKey: "rangeStart",
		header: "Slots",
		cell: ({ row }) => (
			<span className="font-mono text-xs">
				{row.original.rangeStart}–{row.original.rangeStop - 1}
			</span>
		),
	},
	{
		accessorKey: "leader",
		header: "Leader",
		cell: ({ row }) => <span className="font-mono text-xs">{row.original.leader || "—"}</span>,
	},
	{
		accessorKey: "follower",
		header: "Follower",
		cell: ({ row }) => <span className="font-mono text-xs">{row.original.follower || "—"}</span>,
	},
	{
		accessorKey: "messageCount",
		header: "Messages",
		cell: ({ row }) => <span className="tabular">{formatCount(row.original.messageCount)}</span>,
	},
	{
		accessorKey: "totalSize",
		header: "Size",
		cell: ({ row }) => <span className="tabular">{formatBytes(row.original.totalSize)}</span>,
	},
	{
		accessorKey: "lastDataAt",
		header: "Last write",
		cell: ({ row }) =>
			row.original.lastDataAt ? (
				<span className="text-muted-foreground text-xs">{formatRelative(row.original.lastDataAt)}</span>
			) : (
				<span className="text-muted-foreground text-xs">Never</span>
			),
	},
];

const activity = (active: boolean) => (
	<StatusDot tone={active ? "good" : "idle"} label={active ? "Active" : "Idle"} />
);

const publisherColumns: Array<Column<TopicPublisher>> = [
	{
		accessorKey: "name",
		header: "Publisher",
		cell: ({ row }) => (
			<span className="font-mono text-xs">{row.original.name || row.original.clientId}</span>
		),
	},
	{
		accessorKey: "partition",
		header: "Partition",
		cell: ({ row }) => <span className="tabular">{row.original.partition}</span>,
	},
	{
		accessorKey: "broker",
		header: "Broker",
		cell: ({ row }) => <span className="font-mono text-xs">{row.original.broker}</span>,
	},
	{ accessorKey: "active", header: "State", cell: ({ row }) => activity(row.original.active) },
	{
		accessorKey: "lastPublishedOffset",
		header: "Published / acked",
		cell: ({ row }) => (
			<span className="tabular">
				{formatCount(row.original.lastPublishedOffset)} / {formatCount(row.original.lastAckedOffset)}
			</span>
		),
	},
	{
		accessorKey: "lastSeenAt",
		header: "Seen",
		cell: ({ row }) => (
			<span className="text-muted-foreground text-xs">{formatRelative(row.original.lastSeenAt)}</span>
		),
	},
];

const subscriberColumns: Array<Column<TopicSubscriber>> = [
	{
		accessorKey: "consumerGroup",
		header: "Group",
		cell: ({ row }) => <span className="font-mono text-xs">{row.original.consumerGroup}</span>,
	},
	{
		accessorKey: "consumerId",
		header: "Consumer",
		cell: ({ row }) => (
			<span className="font-mono text-xs">{row.original.consumerId || row.original.clientId}</span>
		),
	},
	{
		accessorKey: "partition",
		header: "Partition",
		cell: ({ row }) => <span className="tabular">{row.original.partition}</span>,
	},
	{ accessorKey: "active", header: "State", cell: ({ row }) => activity(row.original.active) },
	{
		accessorKey: "currentOffset",
		header: "Acked / received",
		cell: ({ row }) => (
			<span className="tabular">
				{formatCount(row.original.currentOffset)} / {formatCount(row.original.lastReceivedOffset)}
			</span>
		),
	},
	{
		accessorKey: "lastSeenAt",
		header: "Seen",
		cell: ({ row }) => (
			<span className="text-muted-foreground text-xs">{formatRelative(row.original.lastSeenAt)}</span>
		),
	},
];

const offsetColumns: Array<Column<ConsumerGroupOffset>> = [
	{
		accessorKey: "consumerGroup",
		header: "Group",
		cell: ({ row }) => <span className="font-mono text-xs">{row.original.consumerGroup}</span>,
	},
	{
		accessorKey: "partition",
		header: "Partition",
		cell: ({ row }) => <span className="tabular">{row.original.partition}</span>,
	},
	{
		accessorKey: "offset",
		header: "Offset",
		cell: ({ row }) => <span className="tabular">{formatCount(row.original.offset)}</span>,
	},
	{
		accessorKey: "updatedAt",
		header: "Committed",
		cell: ({ row }) => (
			<span className="text-muted-foreground text-xs">{formatRelative(row.original.updatedAt)}</span>
		),
	},
];

function TopicSkeleton() {
	return (
		<div className="space-y-6" role="status" aria-label="Loading topic">
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				{[0, 1, 2, 3].map((i) => (
					<SkeletonBlock key={i} className="h-24 rounded-xl" />
				))}
			</div>
			<div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
				<SkeletonBlock className="h-56 rounded-xl" />
				<SkeletonBlock className="h-56 rounded-xl" />
			</div>
		</div>
	);
}
