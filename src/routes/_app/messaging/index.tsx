import type { ClusterNode } from "@shared/api.ts";
import type { TopicSummary } from "@shared/messaging.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Crown, Eraser, MessagesSquare, Plus, Radio, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/kelp/confirm-dialog.tsx";
import { CopyButton } from "@/components/kelp/copy-button.tsx";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import { BarsGhost, Collapse, cellGhost, KPI_TILE } from "@/components/kelp/maintenance/parts.tsx";
import { MessagingInsights } from "@/components/kelp/messaging/insights.tsx";
import {
	draftFrom,
	formatRetention,
	RetentionFields,
	retentionFrom,
} from "@/components/kelp/messaging/retention.tsx";
import { EmptyState, PageHeader, Panel, Section, SkeletonBlock } from "@/components/kelp/page.tsx";
import { KpiGhost, LoadingRegion } from "@/components/kelp/skeletons.tsx";
import { Loaded, Swap } from "@/components/kelp/transitions.tsx";
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
	const query = useQuery(streamsQueries.messaging());
	const { data, isPending } = query;
	const canWrite = useCanWrite();
	const hasBroker = Boolean(data?.brokers.length);

	return (
		<>
			<PageHeader
				title="Messaging"
				description="Topics on SeaweedFS's message queue, the brokers that serve them, and how long they keep data."
				actions={
					canWrite && (
						<Swap id={hasBroker ? "actions" : isPending ? "loading" : "none"}>
							{hasBroker ? (
								<div className="flex flex-wrap items-center gap-2">
									<PurgeButton />
									<CreateTopicDialog />
								</div>
							) : (
								isPending && (
									<div className="flex items-center gap-2">
										<SkeletonBlock className="h-8 w-40" />
										<SkeletonBlock className="h-8 w-32" />
									</div>
								)
							)}
						</Swap>
					)
				}
			/>
			<Loaded query={query} skeleton={<MessagingSkeleton />}>
				{(overview) => (
					<Swap id={overview.brokers.length ? "brokers" : "none"}>
						{overview.brokers.length ? (
							<>
								<MessagingInsights data={overview} />
								<Section title="Topics">
									<TopicsTable topics={overview.topics} />
								</Section>
								<Brokers brokers={overview.brokers} leader={overview.leader} />
							</>
						) : (
							<NoBroker />
						)}
					</Swap>
				)}
			</Loaded>
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
					<span className="mx-auto mt-4 flex w-fit items-center justify-center gap-1 rounded-md bg-raised py-1 pr-1 pl-3 font-mono text-[12px] text-foreground">
						{BROKER_COMMAND}
						<CopyButton value={BROKER_COMMAND} label="Copy command" />
					</span>
				</>
			}
		/>
	);
}

/** The brokers, leader first: the leader balances partitions across the others. */
function Brokers({ brokers, leader }: { brokers: ClusterNode[]; leader: string | null }) {
	const ordered = [...brokers].sort((a, b) => Number(b.address === leader) - Number(a.address === leader));
	return (
		<Section
			title="Brokers"
			description={
				leader
					? "The leader assigns partitions to brokers and moves them when a broker joins or leaves."
					: "Brokers are electing a leader. Partitions are assigned once one wins."
			}
			className="max-w-2xl"
		>
			<ul aria-label="Brokers" className="group-sheet divide-y divide-border">
				{ordered.map((broker) => (
					<li key={broker.address} className="flex h-11 items-center gap-2.5 px-4">
						{broker.address === leader ? (
							<Crown className="size-4 shrink-0 text-warning" aria-label="Leader" />
						) : (
							<Radio className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
						)}
						<span className="min-w-0 flex-1 truncate font-mono text-[13px]">{broker.address}</span>
						{broker.address === leader && (
							<span className="rounded-sm bg-secondary px-1.5 text-[12px] text-muted-foreground">Leader</span>
						)}
						<span className="text-[12px] text-muted-foreground">{broker.version.split(" ")[0]}</span>
					</li>
				))}
			</ul>
		</Section>
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
					<span key={i} className="h-full w-[3px] rounded-full bg-[var(--data-3)]" />
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
		meta: cellGhost("w-40"),
	},
	{
		accessorKey: "partitionCount",
		header: "Partitions",
		cell: ({ row }) => <PartitionTicks count={row.original.partitionCount} />,
		meta: cellGhost("w-16"),
	},
	{
		accessorKey: "messageCount",
		header: "Messages",
		cell: ({ row }) => <span className="tabular">{formatCount(row.original.messageCount)}</span>,
		meta: cellGhost("w-12"),
	},
	{
		accessorKey: "totalSize",
		header: "Size",
		cell: ({ row }) => <span className="tabular">{formatBytes(row.original.totalSize)}</span>,
		meta: cellGhost("w-14"),
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
		meta: cellGhost("w-16"),
	},
	{
		accessorKey: "lastUpdated",
		header: "Updated",
		cell: ({ row }) => (
			<span className="text-muted-foreground">{formatRelative(row.original.lastUpdated)}</span>
		),
		meta: cellGhost("w-16"),
	},
];

function TopicsTable({ topics }: { topics: TopicSummary[] | undefined }) {
	const navigate = useNavigate();
	return (
		<DataTable
			data={topics}
			isLoading={!topics}
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
					<Collapse open={Boolean(invalid)} className="-mt-3">
						<p className="text-[12px] text-destructive">{invalid}</p>
					</Collapse>
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
						<p className="text-[12px] text-muted-foreground">
							More partitions allow more parallel consumers. 1 to 100.
						</p>
					</div>
					<RetentionFields draft={retention} onChange={setRetention} />
					<DialogFooter>
						<Button type="submit" disabled={!ready || create.isPending} pending={create.isPending}>
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
		<LoadingRegion label="Loading messaging">
			<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
				{[0, 1, 2, 3, 4, 5].map((i) => (
					<KpiGhost key={i} trend={false} className={KPI_TILE} />
				))}
			</div>
			<div className="mt-3 grid gap-3 xl:grid-cols-12 [&>*]:min-w-0">
				<Panel
					title="Partitions by topic"
					description="How each topic is spread over brokers"
					className="xl:col-span-4"
				>
					<BarsGhost rows={4} />
				</Panel>
				<Panel title="Busiest topics" description="Messages stored per topic" className="xl:col-span-4">
					<BarsGhost rows={4} />
				</Panel>
				<Panel title="Retention" description="How long each topic keeps messages" className="xl:col-span-4">
					<BarsGhost rows={4} />
				</Panel>
			</div>
			<Section title="Topics">
				<TopicsTable topics={undefined} />
			</Section>
			<Section
				title="Brokers"
				description="The leader assigns partitions to brokers and moves them when a broker joins or leaves."
				className="max-w-2xl"
			>
				<div className="group-sheet flex h-11 items-center justify-between px-4">
					<SkeletonBlock className="h-3.5 w-40" />
					<SkeletonBlock className="h-3 w-12" />
				</div>
			</Section>
		</LoadingRegion>
	);
}
