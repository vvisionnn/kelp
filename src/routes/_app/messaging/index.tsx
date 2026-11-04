import type { ClusterNode } from "@shared/api.ts";
import type { TopicSummary } from "@shared/messaging.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Crown, Eraser, MessagesSquare, Plus, Radio, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/kelp/confirm-dialog.tsx";
import { CopyButton } from "@/components/kelp/copy-button.tsx";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import {
	draftFrom,
	formatRetention,
	RetentionFields,
	retentionFrom,
} from "@/components/kelp/messaging/retention.tsx";
import {
	AuroraCard,
	EmptyState,
	ErrorState,
	PageHeader,
	Reveal,
	SkeletonBlock,
	StatBand,
} from "@/components/kelp/page.tsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api.ts";
import { formatBytes, formatCount, formatRelative } from "@/lib/format.ts";
import { useAction } from "@/lib/mutations.ts";
import { useCanWrite } from "@/lib/session.ts";
import { streamsQueries } from "@/lib/streams-queries.ts";

export const Route = createFileRoute("/_app/messaging/")({
	staticData: { section: "Operations", title: "Messaging" },
	loader: ({ context }) => {
		// Prefetch without blocking: the page renders at once and its skeleton gives way to data.
		void context.queryClient.prefetchQuery(streamsQueries.messaging());
	},
	component: MessagingPage,
});

const BROKER_COMMAND = "weed mq.broker -master=<master-host>:9333";

function MessagingPage() {
	const { data, isPending, error, refetch } = useQuery(streamsQueries.messaging());
	const canWrite = useCanWrite();
	const hasBroker = Boolean(data?.brokers.length);

	return (
		<>
			<PageHeader
				title="Messaging"
				description="Topics on SeaweedFS's message queue, the brokers that serve them, and how long they keep data."
				actions={
					canWrite && hasBroker ? (
						<>
							<PurgeButton />
							<CreateTopicDialog />
						</>
					) : null
				}
			/>
			{isPending ? (
				<MessagingSkeleton />
			) : error ? (
				<ErrorState error={error} onRetry={() => refetch()} />
			) : !hasBroker ? (
				<NoBroker />
			) : (
				<>
					<Reveal className="hairline-t hairline-b py-10">
						<StatBand
							stats={[
								{ label: "Topics", value: data.topics.length },
								{ label: "Messages", value: data.topics.reduce((sum, t) => sum + t.messageCount, 0) },
								{
									label: "Stored",
									value: data.topics.reduce((sum, t) => sum + t.totalSize, 0),
									format: formatBytes,
								},
								{ label: "Brokers", value: data.brokers.length },
							]}
						/>
					</Reveal>
					<Reveal delay={0.05} className="mt-12">
						<Brokers brokers={data.brokers} leader={data.leader} />
					</Reveal>
					<Reveal delay={0.1} className="mt-16">
						<h2 className="mb-6 font-[450] text-3xl tracking-[-0.025em]">Topics</h2>
						<TopicsTable topics={data.topics} />
					</Reveal>
				</>
			)}
		</>
	);
}

function NoBroker() {
	return (
		<EmptyState
			icon={<Radio />}
			title="No message broker is running"
			description={
				<>
					SeaweedFS stores topics through a broker. Start one next to your cluster and it appears here within
					a few seconds.
					<span className="mt-4 flex w-fit items-center justify-center gap-1 justify-self-center rounded-full bg-background/60 py-1.5 pr-1.5 pl-4 font-mono text-foreground text-xs backdrop-blur mx-auto">
						{BROKER_COMMAND}
						<CopyButton value={BROKER_COMMAND} label="Copy command" />
					</span>
				</>
			}
		/>
	);
}

/** The brokers, with the elected leader as the headline: it balances partitions across the others. */
function Brokers({ brokers, leader }: { brokers: ClusterNode[]; leader: string | null }) {
	const lead = brokers.find((b) => b.address === leader);
	return (
		<AuroraCard className="grid gap-8 p-7 sm:p-8 lg:grid-cols-[1fr_1.2fr] lg:items-end">
			<section aria-label="Brokers" className="contents">
				<div className="min-w-0">
					<p className="text-[13px] text-foreground/70">{lead ? "Leader" : "Brokers"}</p>
					{lead ? (
						<p className="mt-3 flex items-center gap-3">
							<Crown className="size-7 shrink-0 text-warning" aria-label="Leader" />
							<span className="truncate font-[450] font-mono text-3xl tracking-[-0.03em] sm:text-4xl">
								{lead.address}
							</span>
						</p>
					) : (
						<p className="mt-3 font-[450] text-3xl tracking-[-0.03em] sm:text-4xl">Electing a leader</p>
					)}
					<p className="mt-4 max-w-[48ch] text-[15px] text-foreground/75">
						{leader
							? "The leader assigns partitions to brokers and moves them when a broker joins or leaves."
							: "Brokers are electing a leader. Partitions are assigned once one wins."}
					</p>
				</div>
				<ul className="flex flex-wrap gap-2 lg:justify-end">
					{brokers.map((broker) => (
						<li
							key={broker.address}
							className="flex h-9 items-center gap-2 rounded-full bg-background/50 px-3.5 backdrop-blur"
						>
							{broker.address === leader ? (
								<Crown className="size-3.5 text-warning" aria-hidden="true" />
							) : (
								<Radio className="size-3.5 text-foreground/60" />
							)}
							<span className="font-mono text-xs">{broker.address}</span>
							<span className="text-foreground/60 text-xs">{broker.version.split(" ")[0]}</span>
						</li>
					))}
				</ul>
			</section>
		</AuroraCard>
	);
}

/** One tick per partition (up to 24), so the table shows how finely each topic is split. */
function PartitionTicks({ count }: { count: number }) {
	const shown = Math.min(count, 24);
	return (
		<span className="flex items-center gap-2.5">
			<span className="tabular">{count}</span>
			<span className="flex h-3 items-center gap-[2px]" aria-hidden="true">
				{Array.from({ length: shown }, (_, i) => i).map((i) => (
					<span key={i} className="h-full w-[3px] rounded-full bg-area/70" />
				))}
			</span>
		</span>
	);
}

export const topicColumns: Array<Column<TopicSummary>> = [
	{
		accessorKey: "name",
		header: "Topic",
		cell: ({ row }) => (
			<div className="flex items-center gap-2">
				<span className="font-mono">
					<span className="text-muted-foreground">{row.original.namespace}.</span>
					{row.original.name}
				</span>
				{row.original.detailError && (
					<Tooltip>
						<TooltipTrigger
							render={<TriangleAlert className="size-3.5 text-warning" aria-label="Details unavailable" />}
						/>
						<TooltipContent>{row.original.detailError}</TooltipContent>
					</Tooltip>
				)}
			</div>
		),
		size: 260,
	},
	{
		accessorKey: "partitionCount",
		header: "Partitions",
		cell: ({ row }) => <PartitionTicks count={row.original.partitionCount} />,
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
		id: "retention",
		header: "Retention",
		cell: ({ row }) =>
			row.original.retention.enabled ? (
				formatRetention(row.original.retention)
			) : (
				<Badge variant="secondary">Keep forever</Badge>
			),
	},
	{
		accessorKey: "lastUpdated",
		header: "Updated",
		cell: ({ row }) => (
			<span className="text-muted-foreground text-xs">{formatRelative(row.original.lastUpdated)}</span>
		),
	},
];

function TopicsTable({ topics }: { topics: TopicSummary[] }) {
	const navigate = useNavigate();
	return (
		<DataTable
			data={topics}
			columns={topicColumns}
			getRowId={(t) => `${t.namespace}.${t.name}`}
			searchText={(t) => `${t.namespace} ${t.name}`}
			searchPlaceholder="Search topics"
			onRowClick={(t) =>
				navigate({ to: "/messaging/$namespace/$topic", params: { namespace: t.namespace, topic: t.name } })
			}
			empty={
				<EmptyState
					icon={<MessagesSquare />}
					title="No topics yet"
					description="Create a topic, or publish to one from a client and it shows up here."
				/>
			}
		/>
	);
}

function PurgeButton() {
	const purge = useAction({
		run: () => api.post("/messaging/retention/purge"),
		success: "Expired messages purged",
		invalidate: [["messaging"]],
	});
	return (
		<ConfirmDialog
			trigger={
				<Button variant="outline">
					<Eraser />
					Purge expired data
				</Button>
			}
			title="Purge expired messages now?"
			description="SeaweedFS deletes data older than each topic's retention window. Topics that keep messages forever are not touched."
			confirmLabel="Purge expired data"
			onConfirm={() => purge.mutateAsync()}
		/>
	);
}

const NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

export function CreateTopicDialog() {
	const [open, setOpen] = useState(false);
	const [namespace, setNamespace] = useState("");
	const [name, setName] = useState("");
	const [partitions, setPartitions] = useState(4);
	const [retention, setRetention] = useState(draftFrom({ enabled: true, seconds: 7 * 86_400 }));
	const navigate = useNavigate();
	const create = useAction({
		run: () =>
			api.post("/messaging/topics", {
				namespace: namespace.trim(),
				name: name.trim(),
				partitionCount: partitions,
				retention: retentionFrom(retention),
			}),
		success: () => `Topic ${namespace.trim()}.${name.trim()} created`,
		invalidate: [["messaging"]],
		onSuccess: () => {
			setOpen(false);
			navigate({
				to: "/messaging/$namespace/$topic",
				params: { namespace: namespace.trim(), topic: name.trim() },
			});
		},
	});
	const invalid =
		(namespace && !NAME.test(namespace.trim())) || (name && !NAME.test(name.trim()))
			? "Names use letters, digits, dots, dashes and underscores."
			: null;
	const ready = NAME.test(namespace.trim()) && NAME.test(name.trim()) && partitions >= 1 && partitions <= 100;

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) create.reset();
			}}
		>
			<DialogTrigger
				render={
					<Button>
						<Plus />
						Create topic
					</Button>
				}
			/>
			<DialogContent className="sm:max-w-md">
				<form
					className="grid gap-5"
					onSubmit={(event) => {
						event.preventDefault();
						if (ready) create.mutate();
					}}
				>
					<DialogHeader>
						<DialogTitle>Create topic</DialogTitle>
						<DialogDescription>Publishers and subscribers address it as namespace.name.</DialogDescription>
					</DialogHeader>
					<div className="grid grid-cols-2 gap-3">
						<div className="grid gap-1.5">
							<Label htmlFor="topic-namespace">Namespace</Label>
							<Input
								id="topic-namespace"
								placeholder="orders"
								value={namespace}
								onChange={(e) => setNamespace(e.target.value)}
								autoComplete="off"
							/>
						</div>
						<div className="grid gap-1.5">
							<Label htmlFor="topic-name">Name</Label>
							<Input
								id="topic-name"
								placeholder="created"
								value={name}
								onChange={(e) => setName(e.target.value)}
								autoComplete="off"
							/>
						</div>
					</div>
					{invalid && <p className="-mt-3 text-destructive text-xs">{invalid}</p>}
					<div className="grid gap-1.5">
						<Label htmlFor="topic-partitions">Partitions</Label>
						<Input
							id="topic-partitions"
							type="number"
							min={1}
							max={100}
							className="w-24 tabular"
							value={partitions}
							onChange={(e) => setPartitions(Math.floor(Number(e.target.value) || 0))}
						/>
						<p className="text-muted-foreground text-xs">
							More partitions allow more parallel consumers. 1 to 100.
						</p>
					</div>
					<RetentionFields draft={retention} onChange={setRetention} />
					<DialogFooter>
						<Button type="submit" disabled={!ready || create.isPending}>
							{create.isPending && <Spinner />}
							Create topic
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function MessagingSkeleton() {
	return (
		<div role="status" aria-label="Loading messaging">
			<div className="grid grid-cols-2 gap-8 py-10 sm:grid-cols-4">
				{[0, 1, 2, 3].map((i) => (
					<SkeletonBlock key={i} className="h-16" />
				))}
			</div>
			<SkeletonBlock className="mt-12 h-44 rounded-2xl" />
			<SkeletonBlock className="mt-16 h-64 rounded-lg" />
		</div>
	);
}
