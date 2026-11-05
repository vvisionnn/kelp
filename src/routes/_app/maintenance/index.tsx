import type { JobTypeSummary, MaintenanceOverview, MaintenanceWorker } from "@shared/maintenance.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, ChevronRight, ListChecks } from "lucide-react";
import { compact, Kpi } from "@/components/kelp/charts/index.ts";
import { ChecksChart, lastDay, OutcomesChart, WorkerTime } from "@/components/kelp/maintenance/insights.tsx";
import {
	ACTIVE_STATES,
	ActivityFeed,
	condenseActivities,
	formatInterval,
	humanize,
	JobTypeIcon,
	OutcomeBadge,
	Pill,
} from "@/components/kelp/maintenance/parts.tsx";
import { successRate, waitProgress } from "@/components/kelp/maintenance/stats.ts";
import {
	CapacityBar,
	EmptyState,
	ErrorState,
	PageHeader,
	Panel,
	Reveal,
	Section,
	SkeletonBlock,
	StatusDot,
} from "@/components/kelp/page.tsx";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/format.ts";
import { maintenanceQueries } from "@/lib/maintenance-queries.ts";

export const Route = createFileRoute("/_app/maintenance/")({
	staticData: { section: "Operations", title: "Maintenance" },
	loader: ({ context }) =>
		void Promise.all([
			context.queryClient.prefetchQuery(maintenanceQueries.overview()),
			context.queryClient.prefetchQuery(maintenanceQueries.jobs()),
		]),
	component: MaintenancePage,
});

/** One sentence describing whether automated maintenance is working. */
export function maintenanceSummary(overview: MaintenanceOverview): {
	tone: "good" | "warn" | "bad" | "idle";
	text: string;
} {
	if (!overview.enabled)
		return { tone: "idle", text: "Automated maintenance is turned off on the admin server." };
	if (overview.workerCount === 0) {
		return { tone: "bad", text: "No workers are connected, so nothing can run. Start `weed worker`." };
	}
	// "skipped" (cooldown, nothing to do) is normal; only errors count as failures.
	const failing = overview.jobTypes.filter(
		(t) => t.lastRunStatus === "error" || t.lastRunStatus === "failed",
	);
	if (failing.length > 0) {
		return { tone: "warn", text: `${failing.map((t) => t.displayName).join(", ")} failed on the last run.` };
	}
	const enabled = overview.jobTypes.filter((t) => t.enabled).length;
	return {
		tone: "good",
		text: `Running. ${enabled} of ${overview.jobTypes.length} job types are scheduled.`,
	};
}

function MaintenancePage() {
	const overview = useQuery(maintenanceQueries.overview());
	const jobs = useQuery(maintenanceQueries.jobs());
	const activities = useQuery(maintenanceQueries.activities());
	const history = useQuery(maintenanceQueries.history());

	if (overview.isPending) return <MaintenanceSkeleton />;
	if (overview.error) return <ErrorState error={overview.error} onRetry={() => overview.refetch()} />;
	const data = overview.data;
	const summary = maintenanceSummary(data);
	const names = Object.fromEntries(data.jobTypes.map((t) => [t.jobType, t.displayName]));
	const allJobs = jobs.data ?? [];
	const active = allJobs.filter((j) => ACTIVE_STATES.has(j.state)).length;
	const dayAgo = Date.now() - 86_400_000;
	const recent = allJobs.filter((j) => j.completedAt && new Date(j.completedAt).getTime() >= dayAgo);
	const failed = recent.filter((j) => j.state === "failed").length;
	const past = history.data ?? { jobs: allJobs, activities: [] };
	const buckets = lastDay(past.jobs, past.activities);
	const checks = buckets.reduce((sum, b) => sum + b.checks, 0);
	const proposed = buckets.reduce((sum, b) => sum + b.proposals, 0);
	const rate = successRate(past.jobs);
	const finishedRuns = past.jobs.filter((j) => j.state === "succeeded" || j.state === "failed").length;
	const slots = data.workers.reduce(
		(acc, w) => ({ used: acc.used + w.executionSlots.used, total: acc.total + w.executionSlots.total }),
		{ used: 0, total: 0 },
	);
	const queued = data.workers.reduce(
		(sum, w) => sum + Object.values(w.queuedByType).reduce((a, b) => a + b, 0),
		0,
	);

	return (
		<>
			<PageHeader
				title="Maintenance"
				description={<StatusDot tone={summary.tone} label={summary.text} />}
				actions={
					<>
						<SchedulerLine overview={data} />
						<Button variant="outline" render={<Link to="/maintenance/jobs" />}>
							<ListChecks />
							All jobs
						</Button>
					</>
				}
			/>

			<Reveal>
				<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
					<Kpi
						label="Workers"
						value={String(data.workerCount)}
						hint={`${slots.used} of ${slots.total} slots busy`}
					/>
					<Kpi label="Running now" value={String(active)} hint={`${queued} queued on workers`} />
					<Kpi
						label="Checks, 24 hours"
						value={compact(checks)}
						hint={`${compact(proposed)} ${proposed === 1 ? "job" : "jobs"} proposed`}
						trend={buckets.map((b) => b.checks)}
						color="var(--data-1)"
					/>
					<Kpi
						label="Finished, 24 hours"
						value={String(recent.length - failed)}
						hint="Jobs that completed"
						trend={buckets.map((b) => b.succeeded)}
						color="var(--data-3)"
					/>
					<Kpi
						label="Failed, 24 hours"
						value={String(failed)}
						hint={failed > 0 ? "Open a job to see why" : "Nothing has failed"}
						trend={buckets.map((b) => b.failed)}
						color="var(--data-2)"
						{...(failed > 0 ? { tone: "bad" as const } : {})}
					/>
					<Kpi
						label="Success rate"
						{...(rate === null ? { value: "–" } : { value: String(Math.round(rate * 100)), unit: "%" })}
						hint={rate === null ? "No job has finished yet" : `Of the last ${finishedRuns} finished jobs`}
						{...(rate !== null && rate < 0.9 ? { tone: "warn" as const } : {})}
					/>
				</div>
				<div className="mt-3 grid gap-3 xl:grid-cols-12 [&>*]:min-w-0">
					<Panel
						title="Checks for work"
						description="Scheduled checks per hour, last 24 hours"
						className="xl:col-span-4"
					>
						<ChecksChart buckets={buckets} />
					</Panel>
					<Panel
						title="Finished jobs"
						description="Jobs per hour by outcome, last 24 hours"
						className="xl:col-span-4"
					>
						<OutcomesChart buckets={buckets} />
					</Panel>
					<Panel
						title="Where worker time goes"
						description="Total run time by job type"
						className="xl:col-span-4"
					>
						<WorkerTime jobs={past.jobs} names={names} />
					</Panel>
				</div>
			</Reveal>

			<Section
				title="Job types"
				description="SeaweedFS checks for work on a schedule and hands it to workers. Open a job type to change its schedule or run it now."
			>
				{data.jobTypes.length === 0 ? (
					<EmptyState
						icon={<Bot />}
						title="No job types yet"
						description="Job types appear once a worker connects and tells the admin server what it can do."
					/>
				) : (
					<JobTypeList jobTypes={data.jobTypes} />
				)}
			</Section>

			<div className="mt-8 grid items-start gap-x-6 gap-y-8 lg:grid-cols-12">
				<Section
					title="Activity"
					description="Detections, dispatches and results as they happen"
					className="mt-0 lg:col-span-7"
				>
					{activities.isPending ? (
						<div className="group-sheet space-y-2 p-4">
							{[0, 1, 2, 3, 4].map((i) => (
								<SkeletonBlock key={i} className="h-9" />
							))}
						</div>
					) : activities.error ? (
						<ErrorState error={activities.error} onRetry={() => activities.refetch()} />
					) : (
						<div className="group-sheet max-h-[34rem] overflow-y-auto">
							<ActivityFeed activities={condenseActivities(activities.data)} names={names} />
						</div>
					)}
				</Section>
				<div className="space-y-8 lg:col-span-5">
					<Section
						title="Workers"
						description="Processes that detect and run maintenance jobs"
						className="mt-0"
					>
						{data.workers.length === 0 ? (
							<p className="group-sheet px-4 py-3 text-[13px] text-muted-foreground">
								No workers are connected. Start one with{" "}
								<span className="font-mono">weed worker -admin=&lt;admin address&gt;</span>.
							</p>
						) : (
							<ul className="group-sheet divide-y divide-border">
								{data.workers.map((worker) => (
									<WorkerRow key={worker.id} worker={worker} names={names} />
								))}
							</ul>
						)}
					</Section>
					<Section
						title="Lanes"
						description="Job types in a lane take turns; lanes run side by side"
						className="mt-0"
					>
						<ul className="group-sheet divide-y divide-border">
							{data.lanes.map((lane) => (
								<li key={lane.name} className="flex items-start justify-between gap-3 px-4 py-2.5">
									<div className="min-w-0">
										<p className="font-medium text-[13px]">{lane.name}</p>
										<p className="text-[12px] text-muted-foreground">
											{lane.jobTypes.map((t) => names[t] ?? humanize(t)).join(", ")}
										</p>
									</div>
									<div className="shrink-0 text-right text-[12px]">
										<p className="capitalize">{lane.phase || "idle"}</p>
										<p className="text-muted-foreground">next {formatRelative(lane.nextDetectionAt)}</p>
									</div>
								</li>
							))}
						</ul>
					</Section>
				</div>
			</div>
		</>
	);
}

function SchedulerLine({ overview }: { overview: MaintenanceOverview }) {
	const { scheduler } = overview;
	const busy = scheduler.phase && scheduler.phase !== "sleeping" && scheduler.phase !== "idle";
	return (
		<p className="inline-flex h-8 items-center rounded-md px-1 text-[13px] text-muted-foreground">
			{busy ? (
				<span className="inline-flex items-center gap-2 text-foreground">
					<span className="size-1.5 rounded-full bg-primary" />
					Scheduler is {scheduler.phase.replace(/_/g, " ")}
					{scheduler.currentJobType && ` ${scheduler.currentJobType.replace(/_/g, " ")}`}
				</span>
			) : (
				<>Next check {formatRelative(scheduler.nextDetectionAt)}</>
			)}
		</p>
	);
}

/** Every job type as a row: what it does, when it next looks for work, and how the last run went. */
function JobTypeList({ jobTypes }: { jobTypes: JobTypeSummary[] }) {
	return (
		<ul className="group-sheet divide-y divide-border overflow-hidden">
			{jobTypes.map((type) => {
				const problem =
					type.lastDetectionError ||
					type.policyError ||
					(!type.detectorAvailable ? "No connected worker can detect this job type." : "");
				return (
					<li key={type.jobType}>
						<Link
							to="/maintenance/$jobType"
							params={{ jobType: type.jobType }}
							className="group grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-raised/70 focus-visible:bg-raised md:grid-cols-[auto_minmax(0,1fr)_10rem_11rem_auto]"
						>
							<span className="flex size-8 items-center justify-center rounded-md bg-secondary text-muted-foreground [&_svg]:size-4">
								<JobTypeIcon jobType={type.jobType} />
							</span>
							<div className="min-w-0">
								<p className="flex flex-wrap items-center gap-2">
									<span className="font-semibold text-[13px]">{type.displayName}</span>
									{!type.enabled && (
										<Pill tone="neutral" dot={false}>
											Manual only
										</Pill>
									)}
								</p>
								<p className="truncate text-[12px] text-muted-foreground">{type.description}</p>
								{problem && <p className="mt-0.5 text-[12px] text-destructive">{problem}</p>}
								{!type.lastDetectionError && type.lastDetectionSkipped && (
									<p className="mt-0.5 text-[12px] text-muted-foreground">
										Skipped last check: {type.lastDetectionSkipped}
									</p>
								)}
							</div>
							<ChevronRight className="size-4 text-tertiary md:order-last" />
							<dl className="col-span-3 grid grid-cols-2 gap-4 pl-10 text-[12px] md:col-span-2 md:pl-0">
								<div>
									<dt className="text-muted-foreground">
										{type.detectionInFlight ? "Checking" : "Next check"}
									</dt>
									<dd className="text-[13px]">
										{type.detectionInFlight ? (
											<span className="text-primary">now</span>
										) : type.enabled ? (
											formatRelative(type.nextDetectionAt)
										) : (
											"when started"
										)}
										{type.detectionIntervalMinutes > 0 && type.enabled && (
											<span className="text-muted-foreground">
												, {formatInterval(type.detectionIntervalMinutes)}
											</span>
										)}
										<NextCheckMeter type={type} />
									</dd>
								</div>
								<div>
									<dt className="text-muted-foreground">Last run</dt>
									<dd className="flex flex-wrap items-center gap-1.5">
										{type.lastRunStatus ? (
											<>
												<OutcomeBadge outcome={type.lastRunStatus} />
												<span className="text-muted-foreground">
													{formatRelative(type.lastRunCompletedAt)}
												</span>
											</>
										) : (
											<span className="text-[13px] text-muted-foreground">Not yet</span>
										)}
									</dd>
								</div>
							</dl>
						</Link>
					</li>
				);
			})}
		</ul>
	);
}

/** How far a job type is through its wait for the next check, as a hairline meter. */
function NextCheckMeter({ type }: { type: JobTypeSummary }) {
	const progress = type.enabled ? waitProgress(type.lastDetectedAt, type.nextDetectionAt, Date.now()) : null;
	if (progress === null) return null;
	return (
		<span
			aria-hidden="true"
			className="mt-1.5 block h-0.5 w-28 overflow-hidden rounded-full bg-accent"
			title={`${Math.round(progress * 100)}% of the wait has passed`}
		>
			<span className="spectrum block h-full rounded-full" style={{ width: `${progress * 100}%` }} />
		</span>
	);
}

export function WorkerRow({ worker, names }: { worker: MaintenanceWorker; names: Record<string, string> }) {
	const queued = Object.values(worker.queuedByType).reduce((sum, n) => sum + n, 0);
	return (
		<li className="px-4 py-3">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="truncate font-mono text-[13px]">{worker.address || worker.id}</p>
					<p className="text-[12px] text-muted-foreground">
						SeaweedFS {worker.version.split(" ")[0] || "unknown"}, connected{" "}
						{formatRelative(worker.connectedAt)}
					</p>
				</div>
				<span className="shrink-0 text-[12px]">
					<StatusDot tone="good" label={`Seen ${formatRelative(worker.lastSeenAt)}`} />
				</span>
			</div>
			<div className="mt-3 grid grid-cols-2 gap-4 text-[12px]">
				<div>
					<p className="mb-1.5 flex justify-between text-muted-foreground">
						<span>Detection slots</span>
						<span className="tabular">
							{worker.detectionSlots.used}/{worker.detectionSlots.total}
						</span>
					</p>
					<CapacityBar used={worker.detectionSlots.used} total={worker.detectionSlots.total} />
				</div>
				<div>
					<p className="mb-1.5 flex justify-between text-muted-foreground">
						<span>Execution slots</span>
						<span className="tabular">
							{worker.executionSlots.used}/{worker.executionSlots.total}
						</span>
					</p>
					<CapacityBar used={worker.executionSlots.used} total={worker.executionSlots.total} />
				</div>
			</div>
			{(worker.running.length > 0 || queued > 0) && (
				<ul className="mt-3 space-y-1 text-[12px]">
					{worker.running.map((work) => (
						<li key={work.id} className="flex items-center justify-between gap-2">
							<span className="truncate">
								{work.kind === "detection" ? "Checking" : "Running"} {names[work.jobType] ?? work.jobType}
							</span>
							<span className="tabular text-muted-foreground">{Math.round(work.progress)}%</span>
						</li>
					))}
					{queued > 0 && <li className="text-muted-foreground">{queued} queued on this worker</li>}
				</ul>
			)}
			<div className="mt-3 flex flex-wrap gap-1">
				{worker.capabilities.map((cap) => (
					<span
						key={cap.jobType}
						className="inline-flex h-5 items-center gap-1 rounded-sm bg-secondary px-1.5 text-[12px] text-muted-foreground"
					>
						<JobTypeIcon jobType={cap.jobType} className="size-3" />
						{cap.displayName}
					</span>
				))}
			</div>
		</li>
	);
}

function MaintenanceSkeleton() {
	return (
		<div role="status" aria-busy="true" aria-label="Loading maintenance">
			<div className="flex items-center gap-3 pt-2 pb-6">
				<div className="space-y-1.5">
					<SkeletonBlock className="h-7 w-48" />
					<SkeletonBlock className="h-4 w-80 max-w-full" />
				</div>
			</div>
			<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
				{[0, 1, 2, 3, 4, 5].map((i) => (
					<SkeletonBlock key={i} className="h-[104px] rounded-xl" />
				))}
			</div>
			<SkeletonBlock className="mt-3 h-64 rounded-xl" />
			<SkeletonBlock className="mt-8 h-6 w-32" />
			<SkeletonBlock className="mt-3 h-80 rounded-xl" />
		</div>
	);
}
