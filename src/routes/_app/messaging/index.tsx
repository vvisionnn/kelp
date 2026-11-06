import type { ClusterNode } from "@shared/api.ts";
import type { TopicSummary } from "@shared/messaging.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Crown, Eraser, MessagesSquare, Plus, Radio } from "lucide-react";
import { ConfirmDialog } from "@/components/kelp/confirm-dialog.tsx";
import { CopyButton } from "@/components/kelp/copy-button.tsx";
import { DataTable } from "@/components/kelp/data-table.tsx";
import { BarsGhost, KPI_TILE } from "@/components/kelp/maintenance/parts.tsx";
import { CreateTopicDialog } from "@/components/kelp/messaging/create-topic-dialog.tsx";
import { MessagingInsights } from "@/components/kelp/messaging/insights.tsx";
import { topicColumns } from "@/components/kelp/messaging/topic-columns.tsx";
import { EmptyState, PageHeader, Panel, Section, SkeletonBlock } from "@/components/kelp/page.tsx";
import { KpiGhost, LoadingRegion } from "@/components/kelp/skeletons.tsx";
import { Loaded, Swap } from "@/components/kelp/transitions.tsx";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api.ts";
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
						<Swap id={hasBroker ? "actions" : isPending ? "loading" : "no-broker"}>
							{hasBroker ? (
								<div className="flex flex-wrap items-center gap-2">
									<PurgeButton />
									<CreateTopicDialog />
								</div>
							) : isPending ? (
								<div className="flex items-center gap-2">
									<SkeletonBlock className="h-8 w-40" />
									<SkeletonBlock className="h-8 w-32" />
								</div>
							) : (
								// Kept in place, so the header holds its shape and says what is missing.
								<Tooltip>
									<TooltipTrigger render={<span className="inline-flex" />}>
										<Button disabled>
											<Plus />
											Create topic
										</Button>
									</TooltipTrigger>
									<TooltipContent>Topics need a running message broker</TooltipContent>
								</Tooltip>
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
