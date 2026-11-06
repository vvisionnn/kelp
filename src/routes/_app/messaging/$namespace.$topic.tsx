import type {
	ConsumerGroupOffset,
	TopicDetail,
	TopicPartition,
	TopicPublisher,
	TopicSchemaField,
	TopicSubscriber,
} from "@shared/messaging.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Inbox } from "lucide-react";
import { useEffect, useState } from "react";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import { BarsGhost, cellGhost, InfoGhost, KPI_TILE } from "@/components/kelp/maintenance/parts.tsx";
import { TopicInsights } from "@/components/kelp/messaging/insights.tsx";
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
	InfoList,
	PageHeader,
	Panel,
	Section,
	SkeletonBlock,
	StatusDot,
} from "@/components/kelp/page.tsx";
import { ChartGhost, KpiGhost, LoadingRegion, RowsGhost } from "@/components/kelp/skeletons.tsx";
import { TextMorph } from "@/components/kelp/text-morph.tsx";
import { Loaded, Swap } from "@/components/kelp/transitions.tsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
	const query = useQuery(streamsQueries.topic(namespace, topic));
	const { data, error } = query;
	return (
		<>
			<PageHeader
				title={`${namespace}.${topic}`}
				description={
					data ? (
						<TextMorph className="block overflow-hidden">
							{`${data.partitions.length} ${data.partitions.length === 1 ? "partition" : "partitions"}, ${data.retention.enabled && data.retention.seconds > 0 ? `keeps messages for ${formatRetention(data.retention)}` : "keeps messages forever"}`}
						</TextMorph>
					) : error ? (
						"A topic on SeaweedFS's message queue"
					) : (
						<SkeletonBlock className="my-0.5 h-3.5 w-64 max-w-full" />
					)
				}
			/>
			<Loaded query={query} skeleton={<TopicSkeleton />}>
				{(detail) => <TopicBody topic={detail} />}
			</Loaded>
		</>
	);
}

function TopicBody({ topic }: { topic: TopicDetail }) {
	const leaders = new Set(topic.partitions.map((p) => p.leader).filter(Boolean)).size;
	const groups = new Set(topic.consumerGroupOffsets.map((o) => o.consumerGroup)).size;
	return (
		<>
			<TopicInsights topic={topic} />
			<div className="mt-3 grid items-start gap-x-6 gap-y-8 lg:grid-cols-12">
				<section aria-label="Key ring" className="group-sheet p-4 lg:col-span-7">
					<p className="mb-3 text-[12px] text-muted-foreground">
						Each partition owns a slice of the 2,520-slot key ring.
					</p>
					<PartitionRing partitions={topic.partitions} />
				</section>
				<InfoList
					className="lg:col-span-5"
					items={[
						{ label: "Leading brokers", value: <TextMorph className="tabular">{String(leaders)}</TextMorph> },
						{ label: "Keeps messages", value: <TextMorph>{formatRetention(topic.retention)}</TextMorph> },
						{
							label: "Schema fields",
							value: (
								<TextMorph className="tabular">
									{String(topic.keySchema.length + topic.valueSchema.length)}
								</TextMorph>
							),
						},
						{ label: "Consumer groups", value: <TextMorph className="tabular">{String(groups)}</TextMorph> },
						{
							label: "Created",
							value: <TextMorph>{topic.createdAt ? formatRelative(topic.createdAt) : "Unknown"}</TextMorph>,
						},
						{
							label: "Last updated",
							value: <TextMorph>{topic.lastUpdated ? formatRelative(topic.lastUpdated) : "Never"}</TextMorph>,
						},
					]}
				/>
			</div>
			<Section title="Partition details">
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
			</Section>
			<div className="mt-8 grid items-start gap-x-6 gap-y-8 lg:grid-cols-2">
				<RetentionPanel topic={topic} />
				<SchemaPanel keys={topic.keySchema} values={topic.valueSchema} />
			</div>
			<ClientsPanel topic={topic} />
		</>
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
		<Section
			title="Retention"
			description={<TextMorph>{`Currently: ${formatRetention(topic.retention)}.`}</TextMorph>}
			className="mt-0"
		>
			{canWrite ? (
				<form
					className="group-sheet grid gap-4 p-4"
					onSubmit={(event) => {
						event.preventDefault();
						save.mutate();
					}}
				>
					<RetentionFields draft={draft} onChange={setDraft} disabled={save.isPending} />
					<div className="flex justify-end gap-2">
						<Swap id={dirty ? "dirty" : "clean"}>
							{dirty && (
								<Button type="button" variant="secondary" onClick={() => setDraft(saved)}>
									Discard
								</Button>
							)}
						</Swap>
						<Button type="submit" disabled={!dirty || save.isPending} pending={save.isPending}>
							Save retention
						</Button>
					</div>
				</form>
			) : (
				<p className="group-sheet px-4 py-3 text-[13px] text-muted-foreground">
					Only administrators can change retention.
				</p>
			)}
		</Section>
	);
}

function SchemaFields({ fields }: { fields: TopicSchemaField[] }) {
	return (
		<ul className="divide-y divide-border text-[13px]">
			{fields.map((field) => (
				<li key={field.name} className="flex h-10 items-center justify-between gap-3 px-4">
					<span className="font-mono">{field.name}</span>
					<span className="flex items-center gap-1.5">
						<Badge variant="secondary" className="font-mono">
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
		<Section title="Schema" description="Record types registered for keys and values." className="mt-0">
			{keys.length || values.length ? (
				<div className="group-sheet divide-y divide-border">
					<div>
						<h3 className="px-4 pt-2.5 text-[12px] text-muted-foreground">Key</h3>
						{keys.length ? (
							<SchemaFields fields={keys} />
						) : (
							<p className="px-4 pb-2.5 text-[13px] text-muted-foreground">Raw bytes</p>
						)}
					</div>
					<div>
						<h3 className="px-4 pt-2.5 text-[12px] text-muted-foreground">Value</h3>
						{values.length ? (
							<SchemaFields fields={values} />
						) : (
							<p className="px-4 pb-2.5 text-[13px] text-muted-foreground">Raw bytes</p>
						)}
					</div>
				</div>
			) : (
				<p className="group-sheet px-4 py-3 text-[13px] text-muted-foreground">
					No schema registered. Messages are stored as raw bytes.
				</p>
			)}
		</Section>
	);
}

const quiet = (text: string) => (
	<p className="group-sheet px-4 py-6 text-center text-[13px] text-muted-foreground">{text}</p>
);

function ClientsPanel({ topic }: { topic: TopicDetail }) {
	const [tab, setTab] = useState("publishers");
	return (
		<Section
			title="Clients"
			description="Who is reading and writing right now, and where consumer groups will resume."
		>
			<Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
				<TabsList className="mb-3">
					<TabsTrigger value="publishers">
						Publishers <TextMorph>{String(topic.publishers.length)}</TextMorph>
					</TabsTrigger>
					<TabsTrigger value="subscribers">
						Subscribers <TextMorph>{String(topic.subscribers.length)}</TextMorph>
					</TabsTrigger>
					<TabsTrigger value="offsets">
						Offsets <TextMorph>{String(topic.consumerGroupOffsets.length)}</TextMorph>
					</TabsTrigger>
				</TabsList>
				<Swap id={tab}>
					<TabsContent value={tab}>
						{tab === "publishers" ? (
							<DataTable
								data={topic.publishers}
								columns={publisherColumns}
								getRowId={(p) => `${p.clientId}-${p.partition}`}
								empty={quiet("Nobody is publishing. Publishers appear while they are connected.")}
							/>
						) : tab === "subscribers" ? (
							<DataTable
								data={topic.subscribers}
								columns={subscriberColumns}
								getRowId={(s) => `${s.consumerGroup}-${s.consumerId}-${s.partition}`}
								empty={quiet("Nobody is subscribed. Subscribers appear while they are connected.")}
							/>
						) : (
							<DataTable
								data={topic.consumerGroupOffsets}
								columns={offsetColumns}
								getRowId={(o) => `${o.consumerGroup}-${o.partition}`}
								empty={quiet("No committed offsets. Consumer groups commit offsets as they read.")}
							/>
						)}
					</TabsContent>
				</Swap>
			</Tabs>
		</Section>
	);
}

const partitionColumns: Array<Column<TopicPartition>> = [
	{
		accessorKey: "rangeStart",
		header: "Slots",
		meta: cellGhost("w-20"),
		cell: ({ row }) => (
			<span className="font-mono text-[12px]">
				{row.original.rangeStart}–{row.original.rangeStop - 1}
			</span>
		),
	},
	{
		accessorKey: "leader",
		header: "Leader",
		meta: cellGhost("w-28"),
		cell: ({ row }) => <span className="font-mono text-[12px]">{row.original.leader || "—"}</span>,
	},
	{
		accessorKey: "follower",
		header: "Follower",
		meta: cellGhost("w-16"),
		cell: ({ row }) => <span className="font-mono text-[12px]">{row.original.follower || "—"}</span>,
	},
	{
		accessorKey: "messageCount",
		header: "Messages",
		meta: cellGhost("w-12"),
		cell: ({ row }) => <span className="tabular">{formatCount(row.original.messageCount)}</span>,
	},
	{
		accessorKey: "totalSize",
		header: "Size",
		meta: cellGhost("w-14"),
		cell: ({ row }) => <span className="tabular">{formatBytes(row.original.totalSize)}</span>,
	},
	{
		accessorKey: "lastDataAt",
		header: "Last write",
		meta: cellGhost("w-16"),
		cell: ({ row }) =>
			row.original.lastDataAt ? (
				<span className="text-muted-foreground">{formatRelative(row.original.lastDataAt)}</span>
			) : (
				<span className="text-muted-foreground">Never</span>
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
			<span className="font-mono text-[12px]">{row.original.name || row.original.clientId}</span>
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
		cell: ({ row }) => <span className="font-mono text-[12px]">{row.original.broker}</span>,
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
			<span className="text-muted-foreground">{formatRelative(row.original.lastSeenAt)}</span>
		),
	},
];

const subscriberColumns: Array<Column<TopicSubscriber>> = [
	{
		accessorKey: "consumerGroup",
		header: "Group",
		cell: ({ row }) => <span className="font-mono text-[12px]">{row.original.consumerGroup}</span>,
	},
	{
		accessorKey: "consumerId",
		header: "Consumer",
		cell: ({ row }) => (
			<span className="font-mono text-[12px]">{row.original.consumerId || row.original.clientId}</span>
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
			<span className="text-muted-foreground">{formatRelative(row.original.lastSeenAt)}</span>
		),
	},
];

const offsetColumns: Array<Column<ConsumerGroupOffset>> = [
	{
		accessorKey: "consumerGroup",
		header: "Group",
		cell: ({ row }) => <span className="font-mono text-[12px]">{row.original.consumerGroup}</span>,
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
			<span className="text-muted-foreground">{formatRelative(row.original.updatedAt)}</span>
		),
	},
];

function TopicSkeleton() {
	return (
		<LoadingRegion label="Loading topic">
			<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
				{[0, 1, 2, 3, 4, 5].map((i) => (
					<KpiGhost key={i} trend={false} className={KPI_TILE} />
				))}
			</div>
			<div className="mt-3 grid gap-3 xl:grid-cols-12 [&>*]:min-w-0">
				<Panel
					title="Messages per partition"
					description="An even spread means keys hash well"
					className="xl:col-span-7"
				>
					<ChartGhost height={160} legend={false} />
				</Panel>
				<Panel
					title="Consumer groups"
					description="Messages each group has yet to read"
					className="xl:col-span-5"
				>
					<BarsGhost rows={3} />
				</Panel>
			</div>
			<div className="mt-3 grid items-start gap-x-6 gap-y-8 lg:grid-cols-12">
				<section className="group-sheet p-4 lg:col-span-7">
					<p className="mb-3 text-[12px] text-muted-foreground">
						Each partition owns a slice of the 2,520-slot key ring.
					</p>
					<div className="flex flex-wrap items-center gap-6">
						<SkeletonBlock className="size-[184px] rounded-full" />
						<RowsGhost rows={2} className="w-44" />
					</div>
				</section>
				<InfoGhost rows={6} className="lg:col-span-5" />
			</div>
			<Section title="Partition details">
				<DataTable
					data={undefined}
					isLoading
					columns={partitionColumns}
					getRowId={(p) => String(p.rangeStart)}
					empty={null}
				/>
			</Section>
		</LoadingRegion>
	);
}
