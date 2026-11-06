import type { DetectionResult, JobRun, MaintenanceJob } from "@shared/maintenance.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { History, ListChecks, Play, RefreshCw, ScanSearch } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { clock, Kpi } from "@/components/kelp/charts/index.ts";
import { StackedColumns } from "@/components/kelp/charts/stacked-columns.tsx";
import { ConfirmDialog } from "@/components/kelp/confirm-dialog.tsx";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import { ChecksChart, lastDay, StackedGhost } from "@/components/kelp/maintenance/insights.tsx";
import {
	ActivityFeed,
	capitalize,
	cellGhost,
	DataHeader,
	formatDuration,
	formatInterval,
	humanize,
	JobStateBadge,
	KPI_TILE,
	OutcomeBadge,
	Pill,
	settled,
	twoLineGhost,
} from "@/components/kelp/maintenance/parts.tsx";
import { SettingsForm } from "@/components/kelp/maintenance/settings-form.tsx";
import { runStats } from "@/components/kelp/maintenance/stats.ts";
import { EmptyState, Metric, Panel, SkeletonBlock } from "@/components/kelp/page.tsx";
import { KpiGhost, LoadingRegion } from "@/components/kelp/skeletons.tsx";
import { TextMorph } from "@/components/kelp/text-morph.tsx";
import { Loaded, Swap } from "@/components/kelp/transitions.tsx";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateTime, formatRelative } from "@/lib/format.ts";
import { maintenanceApi, maintenanceQueries } from "@/lib/maintenance-queries.ts";
import { useAction } from "@/lib/mutations.ts";
import { oneOf } from "@/lib/search.ts";
import { useCanWrite } from "@/lib/session.ts";

const TABS = ["settings", "jobs", "history"] as const;

export const Route = createFileRoute("/_app/maintenance/$jobType")({
	staticData: {
		section: "Operations",
		title: "Maintenance",
		crumb: ({ jobType = "" }, queryClient) =>
			queryClient.getQueryData(maintenanceQueries.jobType(jobType).queryKey)?.displayName ?? jobType,
	},
	validateSearch: (raw: Record<string, unknown>): { tab?: (typeof TABS)[number] } => ({
		tab: oneOf(raw.tab, TABS),
	}),
	loader: ({ context, params }) =>
		void context.queryClient.prefetchQuery(maintenanceQueries.jobType(params.jobType)),
	component: JobTypePage,
});

/** Toast text for a detection: what was found, or why nothing was. */
export function detectionMessage(result: DetectionResult, name: string): string {
	if (result.error) return `${name} check failed: ${result.error}`;
	if (result.totalProposals > 0) {
		return `${name} found ${result.totalProposals} ${result.totalProposals === 1 ? "job" : "jobs"} to run`;
	}
	return result.skippedReason ? `${name} skipped: ${result.skippedReason}` : `${name} found nothing to do`;
}

/** A button's icon that crossfades to a spinner in the same spot while its action runs. */
function BusyIcon({ busy, children }: { busy: boolean; children: ReactNode }) {
	return (
		<Swap id={busy ? "busy" : "idle"} className="size-4">
			{busy ? <Spinner /> : children}
		</Swap>
	);
}

function JobTypePage() {
	const { jobType } = Route.useParams();
	const { tab = "settings" } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const canWrite = useCanWrite();
	const config = useQuery(maintenanceQueries.jobType(jobType));
	const [detection, setDetection] = useState<DetectionResult | null>(null);
	const name = config.data?.displayName ?? humanize(jobType);

	const invalidate = [["maintenance"]];
	const save = useAction({
		run: (update: Parameters<typeof maintenanceApi.saveConfig>[1]) =>
			maintenanceApi.saveConfig(jobType, update),
		success: `${name} settings saved`,
		invalidate,
	});
	const refreshForm = useAction({
		run: () => maintenanceApi.refreshForm(jobType),
		success: "Settings form reloaded from the worker",
		invalidate,
	});
	const detect = useAction({
		run: () => maintenanceApi.detect(jobType),
		success: (result) => detectionMessage(result, name),
		invalidate,
		onSuccess: (result) => setDetection(result),
	});
	const run = useAction({
		run: () => maintenanceApi.run(jobType),
		success: (result) =>
			result.executed > 0
				? `${name} ran ${result.executed} ${result.executed === 1 ? "job" : "jobs"}: ${result.succeeded} succeeded, ${result.failed} failed`
				: `${name} found nothing to run`,
		invalidate,
	});

	const ready = Boolean(config.data);
	return (
		<>
			<DataHeader
				title={<TextMorph className="block overflow-hidden">{name}</TextMorph>}
				description={
					(ready || !config.error) && (
						<Swap id={ready ? "ready" : "loading"}>
							{config.data?.description ?? <SkeletonBlock className="my-0.5 h-3.5 w-96 max-w-full" />}
						</Swap>
					)
				}
				actions={
					canWrite && (
						<Swap id={ready ? "actions" : config.error ? "none" : "loading"}>
							{ready ? (
								<div className="flex flex-wrap items-center gap-2">
									<Button variant="outline" disabled={detect.isPending} onClick={() => detect.mutate()}>
										<BusyIcon busy={detect.isPending}>
											<ScanSearch />
										</BusyIcon>
										Check for work
									</Button>
									<ConfirmDialog
										trigger={
											<Button disabled={run.isPending}>
												<BusyIcon busy={run.isPending}>
													<Play />
												</BusyIcon>
												Run now
											</Button>
										}
										title={`Run ${name} now?`}
										description="Kelp checks for work right away and starts every job it finds, even outside the schedule. Jobs use cluster resources while they run."
										confirmLabel="Run now"
										onConfirm={() => run.mutateAsync()}
									/>
								</div>
							) : (
								!config.error && (
									<div className="flex items-center gap-2">
										<SkeletonBlock className="h-8 w-36" />
										<SkeletonBlock className="h-8 w-24" />
									</div>
								)
							)}
						</Swap>
					)
				}
			/>
			<Loaded query={config} skeleton={<JobTypeSkeleton />}>
				{(data) => (
					<>
						<dl className="group-sheet grid grid-cols-2 divide-border sm:grid-cols-5 sm:divide-x">
							<div className="col-span-2 px-4 py-3.5 sm:col-span-1">
								<dt className="text-[12px] text-muted-foreground">
									<TextMorph>
										{data.runtime.enabled ? "Runs automatically" : "Runs only when started here"}
									</TextMorph>
								</dt>
								<dd className="mt-0.5 font-semibold text-[20px] leading-6 tracking-[-0.015em]">
									<TextMorph>
										{data.runtime.enabled
											? capitalize(formatInterval(data.runtime.detectionIntervalMinutes) || "on demand")
											: "Manual only"}
									</TextMorph>
								</dd>
							</div>
							<ScheduleFact label="Jobs per check" value={data.runtime.maxJobsPerDetection} />
							<ScheduleFact label="At once in the cluster" value={data.runtime.globalExecutionConcurrency} />
							<ScheduleFact label="At once per worker" value={data.runtime.perWorkerExecutionConcurrency} />
							<ScheduleFact label="Retries" value={data.runtime.retryLimit} />
						</dl>
						<Performance jobType={jobType} />
						<Tabs
							value={tab}
							onValueChange={(value) => navigate({ search: { tab: value as (typeof TABS)[number] } })}
						>
							<div className="mt-8 mb-4 flex items-center justify-between gap-3">
								<TabsList>
									<TabsTrigger value="settings">Settings</TabsTrigger>
									<TabsTrigger value="jobs">Jobs</TabsTrigger>
									<TabsTrigger value="history">Run history</TabsTrigger>
								</TabsList>
								<Swap id={tab === "settings" ? "settings" : "none"}>
									{tab === "settings" && (
										<div className="flex items-center justify-end gap-1">
											{data.updatedAt && (
												<p className="hidden text-[12px] text-muted-foreground sm:block">
													<TextMorph>
														{`Saved ${formatRelative(data.updatedAt)}${data.updatedBy ? ` by ${data.updatedBy}` : ""}`}
													</TextMorph>
												</p>
											)}
											{canWrite && (
												<Tooltip>
													<TooltipTrigger
														render={
															<Button
																variant="ghost"
																size="icon-sm"
																aria-label="Reload settings form from the worker"
																disabled={refreshForm.isPending}
																onClick={() => refreshForm.mutate()}
															>
																<BusyIcon busy={refreshForm.isPending}>
																	<RefreshCw />
																</BusyIcon>
															</Button>
														}
													/>
													<TooltipContent>Reload settings form from the worker</TooltipContent>
												</Tooltip>
											)}
										</div>
									)}
								</Swap>
							</div>
							<Swap id={tab}>
								<TabsContent value={tab}>
									{tab === "settings" ? (
										<SettingsForm
											key={data.updatedAt ?? "new"}
											config={data}
											canWrite={canWrite}
											onSave={(update) => save.mutateAsync(update)}
										/>
									) : tab === "jobs" ? (
										<JobsTab jobType={jobType} />
									) : (
										<HistoryTab jobType={jobType} />
									)}
								</TabsContent>
							</Swap>
						</Tabs>
					</>
				)}
			</Loaded>
			<DetectionSheet
				result={detection}
				name={name}
				running={run.isPending}
				onRun={async () => {
					await run.mutateAsync();
					setDetection(null);
				}}
				onClose={() => setDetection(null)}
			/>
		</>
	);
}

export const jobColumns: Array<Column<MaintenanceJob>> = [
	{
		accessorKey: "summary",
		header: "Job",
		cell: ({ row }) => (
			<div className="min-w-0">
				<Link
					to="/maintenance/jobs/$jobId"
					params={{ jobId: row.original.id }}
					className="font-medium hover:text-primary"
				>
					{row.original.summary || humanize(row.original.jobType)}
				</Link>
				<p className="truncate text-[12px] text-muted-foreground">
					{row.original.message || row.original.resultSummary}
				</p>
			</div>
		),
		size: 320,
		meta: twoLineGhost,
	},
	{
		accessorKey: "state",
		header: "State",
		cell: ({ row }) => <JobStateBadge state={row.original.state} progress={row.original.progress} />,
		meta: cellGhost("w-20"),
	},
	{
		accessorKey: "attempt",
		header: "Attempt",
		cell: ({ row }) => <span className="tabular">{row.original.attempt || 1}</span>,
		meta: cellGhost("w-6"),
	},
	{
		accessorKey: "createdAt",
		header: "Created",
		cell: ({ row }) => (
			<span className="text-muted-foreground text-xs">{formatRelative(row.original.createdAt)}</span>
		),
		meta: cellGhost("w-16"),
	},
	{
		accessorKey: "completedAt",
		header: "Finished",
		cell: ({ row }) => (
			<span className="text-muted-foreground text-xs">{formatRelative(row.original.completedAt)}</span>
		),
		meta: cellGhost("w-16"),
	},
];

function JobsTab({ jobType }: { jobType: string }) {
	const { data, isPending, error, refetch } = useQuery(maintenanceQueries.jobs({ jobType }));
	return (
		<DataTable
			data={data}
			isLoading={isPending}
			error={error}
			onRetry={() => refetch()}
			getRowId={(job) => job.id}
			searchText={(job) => `${job.summary} ${job.message} ${job.id}`}
			searchPlaceholder="Search jobs"
			columns={jobColumns}
			toolbar={
				<Button variant="ghost" size="sm" render={<Link to="/maintenance/jobs" search={{ jobType }} />}>
					<ListChecks />
					Open in all jobs
				</Button>
			}
			empty={
				<EmptyState
					icon={<ListChecks />}
					title="No jobs yet"
					description="Jobs appear here after a check finds work. Use Check for work to look now."
				/>
			}
		/>
	);
}

const runColumns: Array<Column<JobRun>> = [
	{
		accessorKey: "outcome",
		header: "Outcome",
		cell: ({ row }) => <OutcomeBadge outcome={row.original.outcome} />,
		meta: cellGhost("w-20"),
	},
	{
		accessorKey: "message",
		header: "Result",
		cell: ({ row }) =>
			row.original.jobId ? (
				<Link
					to="/maintenance/jobs/$jobId"
					params={{ jobId: row.original.jobId }}
					className="hover:underline"
				>
					{row.original.message || "Open job"}
				</Link>
			) : (
				row.original.message
			),
		size: 360,
		meta: cellGhost("w-3/5"),
	},
	{
		accessorKey: "durationMs",
		header: "Duration",
		cell: ({ row }) => <span className="tabular">{formatDuration(row.original.durationMs)}</span>,
		meta: cellGhost("w-12"),
	},
	{
		accessorKey: "completedAt",
		header: "Finished",
		cell: ({ row }) => (
			<span className="text-muted-foreground text-xs" title={formatDateTime(row.original.completedAt)}>
				{formatRelative(row.original.completedAt)}
			</span>
		),
		meta: cellGhost("w-16"),
	},
];

function HistoryTab({ jobType }: { jobType: string }) {
	const { data, isPending, error, refetch } = useQuery(maintenanceQueries.runs(jobType));
	return (
		<DataTable
			data={data}
			isLoading={isPending}
			error={error}
			onRetry={() => refetch()}
			getRowId={(run) => run.runId}
			columns={runColumns}
			empty={
				<EmptyState
					icon={<History />}
					title="No runs yet"
					description="Finished jobs are recorded here, newest first."
				/>
			}
		/>
	);
}

const PRIORITY_TONE = {
	critical: "danger",
	high: "warning",
	normal: "info",
	low: "neutral",
	unspecified: "neutral",
} as const;

function DetectionSheet({
	result: latest,
	name,
	running,
	onRun,
	onClose,
}: {
	result: DetectionResult | null;
	name: string;
	running: boolean;
	onRun: () => Promise<void>;
	onClose: () => void;
}) {
	// The sheet slides out after the result clears; it keeps showing the result until it has gone.
	const last = useRef(latest);
	if (latest) last.current = latest;
	const result = last.current;
	return (
		<Sheet open={latest !== null} onOpenChange={(open) => !open && onClose()}>
			<SheetContent className="w-full overflow-y-auto sm:max-w-lg">
				<SheetHeader>
					<SheetTitle>{name} check</SheetTitle>
					<SheetDescription>
						{result && result.totalProposals > 0
							? `Found ${result.totalProposals} ${result.totalProposals === 1 ? "job" : "jobs"}. Run now to start them, or let the schedule pick them up.`
							: "Nothing needs doing right now."}
					</SheetDescription>
				</SheetHeader>
				{result && result.totalProposals > 0 && (
					<div className="px-4">
						<Button disabled={running} onClick={() => void onRun().catch(() => {})}>
							<BusyIcon busy={running}>
								<Play />
							</BusyIcon>
							Run these jobs
						</Button>
					</div>
				)}
				{result && (
					<div className="space-y-6 px-4 pb-6">
						{result.error && (
							<p className="rounded-lg bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
								{result.error}
							</p>
						)}
						{result.skippedReason && (
							<p className="rounded-lg bg-raised px-4 py-3 text-[13px]">
								Skipped: {result.skippedReason}
								{result.eligibleAfter && ` Eligible again ${formatRelative(result.eligibleAfter)}.`}
							</p>
						)}
						{result.proposals.length > 0 && (
							<section>
								<h3 className="mb-2 font-semibold text-[13px]">Proposed jobs</h3>
								<ul className="group-sheet divide-y divide-border">
									{result.proposals.map((proposal) => (
										<li key={proposal.id} className="px-4 py-3">
											<div className="flex items-start justify-between gap-2">
												<p className="font-medium text-[13px]">{proposal.summary || proposal.id}</p>
												<Pill tone={PRIORITY_TONE[proposal.priority]} className="capitalize">
													{proposal.priority === "unspecified" ? "normal" : proposal.priority}
												</Pill>
											</div>
											{proposal.detail && (
												<p className="mt-1 text-muted-foreground text-xs">{proposal.detail}</p>
											)}
											{Object.keys(proposal.labels).length > 0 && (
												<div className="mt-2 flex flex-wrap gap-1">
													{Object.entries(proposal.labels)
														.filter(([key, value]) => value && key !== "task_type")
														.map(([key, value]) => (
															<span
																key={key}
																className="inline-flex h-5 items-center gap-1 rounded-sm bg-secondary px-1.5 text-[12px]"
															>
																{humanize(key)}: <span className="font-mono">{value}</span>
															</span>
														))}
												</div>
											)}
										</li>
									))}
								</ul>
							</section>
						)}
						<section>
							<h3 className="mb-2 font-semibold text-[13px]">How the worker decided</h3>
							<div className="group-sheet">
								<ActivityFeed activities={result.activities} showJobType={false} />
							</div>
						</section>
					</div>
				)}
			</SheetContent>
		</Sheet>
	);
}

/** How this job type has been doing: run outcomes and durations, and how often checks find work. */
function Performance({ jobType }: { jobType: string }) {
	const runs = settled(useQuery(maintenanceQueries.runs(jobType)), []);
	const history = settled(useQuery(maintenanceQueries.history(jobType)), { jobs: [], activities: [] });
	return (
		<>
			<Loaded
				query={runs}
				className="mt-3"
				skeleton={
					<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
						{[0, 1, 2, 3].map((i) => (
							<KpiGhost key={i} trend={false} className={KPI_TILE} />
						))}
					</div>
				}
			>
				{(list) => <RunKpis runs={list} />}
			</Loaded>
			<div className="mt-3 grid gap-3 xl:grid-cols-12 [&>*]:min-w-0">
				<Panel
					title="Recent runs"
					description="Duration of each run, oldest to newest"
					className="xl:col-span-7"
				>
					<Loaded query={runs} skeleton={<StackedGhost height={160} />}>
						{(list) => <RecentRuns runs={list} />}
					</Loaded>
				</Panel>
				<Panel title="Checks for work" description="Per hour, last 24 hours" className="xl:col-span-5">
					<Loaded query={history} skeleton={<StackedGhost height={160} />}>
						{(past) => <ChecksChart buckets={lastDay(past.jobs, past.activities)} height={160} />}
					</Loaded>
				</Panel>
			</div>
		</>
	);
}

function RunKpis({ runs }: { runs: JobRun[] }) {
	const stats = runStats(runs);
	return (
		<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
			<Kpi
				label="Runs recorded"
				value={String(stats.runs)}
				hint={`${stats.succeeded} succeeded, ${stats.failed} failed`}
			/>
			<Kpi
				label="Success rate"
				{...(stats.successRate === null
					? { value: "–" }
					: { value: String(Math.round(stats.successRate * 100)), unit: "%" })}
				hint={stats.successRate === null ? "No run has finished yet" : "Of runs in the history"}
				{...(stats.successRate !== null && stats.successRate < 0.9 ? { tone: "warn" as const } : {})}
			/>
			<Kpi
				label="Typical run"
				value={stats.medianMs === null ? "–" : formatDuration(stats.medianMs)}
				hint="Median duration"
			/>
			<Kpi
				label="Longest run"
				value={stats.longestMs === null ? "–" : formatDuration(stats.longestMs)}
				hint="In the recorded history"
			/>
		</div>
	);
}

function RecentRuns({ runs }: { runs: JobRun[] }) {
	const recent = [...runs]
		.filter((r) => r.completedAt)
		.sort((a, b) => new Date(a.completedAt as string).getTime() - new Date(b.completedAt as string).getTime())
		.slice(-30);
	return (
		<StackedColumns
			label="Duration of recent runs by outcome"
			empty="No run has finished yet."
			height={160}
			format={(ms) => (ms > 0 ? formatDuration(ms) : "0")}
			series={[
				{ key: "success", label: "Succeeded", color: "var(--success)" },
				{ key: "error", label: "Failed", color: "var(--destructive)" },
			]}
			columns={recent.map((run) => ({
				key: run.runId,
				label: clock(new Date(run.completedAt as string).getTime()),
				values: { [run.outcome === "success" ? "success" : "error"]: run.durationMs },
			}))}
		/>
	);
}

function ScheduleFact({ label, value }: { label: string; value: number }) {
	return (
		<div className="px-4 py-3.5">
			<dt className="truncate text-[12px] text-muted-foreground">{label}</dt>
			<dd className="metric mt-0.5 font-semibold text-[20px] leading-6">
				<Metric value={value} />
			</dd>
		</div>
	);
}

function JobTypeSkeleton() {
	return (
		<LoadingRegion label="Loading job type">
			<div className="group-sheet grid min-h-[75px] grid-cols-2 divide-border sm:grid-cols-5 sm:divide-x">
				{[0, 1, 2, 3, 4].map((i) => (
					<div key={i} className="px-4 py-3.5 first:col-span-2 sm:first:col-span-1">
						<SkeletonBlock className="my-0.5 h-3.5 w-24" />
						<SkeletonBlock className="mt-1 h-5 w-16" />
					</div>
				))}
			</div>
			<div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
				{[0, 1, 2, 3].map((i) => (
					<KpiGhost key={i} trend={false} className={KPI_TILE} />
				))}
			</div>
			<div className="mt-3 grid gap-3 xl:grid-cols-12 [&>*]:min-w-0">
				<Panel
					title="Recent runs"
					description="Duration of each run, oldest to newest"
					className="xl:col-span-7"
				>
					<StackedGhost height={160} />
				</Panel>
				<Panel title="Checks for work" description="Per hour, last 24 hours" className="xl:col-span-5">
					<StackedGhost height={160} />
				</Panel>
			</div>
			<SkeletonBlock className="mt-8 mb-6 h-8 w-64" />
			<SkeletonBlock className="h-96 rounded-xl" />
		</LoadingRegion>
	);
}
