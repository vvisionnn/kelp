import type { JobTypeSummary, MaintenanceOverview, MaintenanceWorker } from "@shared/maintenance.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Bot, ListChecks, Search, Timer } from "lucide-react";
import { motion } from "motion/react";
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
import { usePrefersReducedMotion } from "@/components/kelp/motion.ts";
import {
	AuroraCard,
	CapacityBar,
	EmptyState,
	ErrorState,
	PageHeader,
	Panel,
	Reveal,
	SkeletonBlock,
	StatBand,
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

	return (
		<>
			<PageHeader
				title="Maintenance"
				description={
					<>
						<span className="inline-flex h-8 items-center rounded-full bg-secondary px-3.5 text-[13px] text-foreground">
							<StatusDot tone={summary.tone} label={summary.text} />
						</span>
						<span className="mt-4 block">
							SeaweedFS checks for work on a schedule and hands it to workers: vacuuming, erasure coding,
							balancing and lifecycle.
						</span>
					</>
				}
				actions={
					<Button variant="outline" render={<Link to="/maintenance/jobs" />}>
						<ListChecks />
						All jobs
					</Button>
				}
			/>

			<Reveal className="hairline-t hairline-b py-10">
				<StatBand
					stats={[
						{ label: "Workers", value: data.workerCount, hint: "Connected to the admin server" },
						{ label: "Running now", value: active, hint: "Queued, assigned or running" },
						{
							label: "Finished today",
							value: recent.length - failed,
							hint: "Completed in the last 24 hours",
						},
						{ label: "Failed today", value: failed, hint: "Open a job to see why" },
					]}
				/>
			</Reveal>

			<Reveal delay={0.05} className="pt-16">
				<div className="mb-8 flex flex-wrap items-end justify-between gap-3">
					<div>
						<h2 className="font-[450] text-3xl tracking-[-0.025em]">Job types</h2>
						<p className="mt-2 text-muted-foreground">
							Open one to change its schedule and settings, or to run it now.
						</p>
					</div>
					<SchedulerLine overview={data} />
				</div>
				{data.jobTypes.length === 0 ? (
					<EmptyState
						icon={<Bot />}
						title="No job types yet"
						description="Job types appear once a worker connects and tells the admin server what it can do."
					/>
				) : (
					<JobTypeList jobTypes={data.jobTypes} />
				)}
			</Reveal>

			<Reveal delay={0.1} className="mt-16 grid items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
				<AuroraCard className="p-6 sm:p-7">
					<div className="flex items-start justify-between gap-3">
						<div>
							<h2 className="flex items-center gap-2.5 font-medium text-[15px]">
								<span className="relative flex size-2">
									<span className="absolute inset-0 animate-ping rounded-full bg-success opacity-50" />
									<span className="relative size-2 rounded-full bg-success" />
								</span>
								Activity
							</h2>
							<p className="mt-1 text-[13px] text-foreground/70">
								Detections, dispatches and results as they happen
							</p>
						</div>
					</div>
					<div className="mt-5">
						{activities.isPending ? (
							<div className="space-y-2">
								{[0, 1, 2, 3, 4].map((i) => (
									<SkeletonBlock key={i} className="h-11 bg-foreground/[0.06]" />
								))}
							</div>
						) : activities.error ? (
							<ErrorState error={activities.error} onRetry={() => activities.refetch()} />
						) : (
							<ActivityFeed
								activities={condenseActivities(activities.data)}
								names={names}
								className="-mx-2.5 max-h-[34rem] overflow-y-auto"
							/>
						)}
					</div>
				</AuroraCard>
				<div className="space-y-4">
					<Panel title="Workers" description="Processes that detect and run maintenance jobs">
						{data.workers.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								No workers are connected. Start one with{" "}
								<span className="font-mono">weed worker -admin=&lt;admin address&gt;</span>.
							</p>
						) : (
							<ul className="divide-y divide-hairline">
								{data.workers.map((worker) => (
									<WorkerRow key={worker.id} worker={worker} names={names} />
								))}
							</ul>
						)}
					</Panel>
					<Panel title="Lanes" description="Job types in a lane take turns; lanes run side by side">
						<ul className="divide-y divide-hairline">
							{data.lanes.map((lane) => (
								<li
									key={lane.name}
									className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
								>
									<div className="min-w-0">
										<p className="font-medium text-sm">{lane.name}</p>
										<p className="mt-0.5 text-muted-foreground text-xs">
											{lane.jobTypes.map((t) => names[t] ?? humanize(t)).join(", ")}
										</p>
									</div>
									<div className="shrink-0 text-right text-xs">
										<p className="capitalize">{lane.phase || "idle"}</p>
										<p className="text-muted-foreground">next {formatRelative(lane.nextDetectionAt)}</p>
									</div>
								</li>
							))}
						</ul>
					</Panel>
				</div>
			</Reveal>
		</>
	);
}

function SchedulerLine({ overview }: { overview: MaintenanceOverview }) {
	const { scheduler } = overview;
	const busy = scheduler.phase && scheduler.phase !== "sleeping" && scheduler.phase !== "idle";
	return (
		<p className="inline-flex h-8 items-center rounded-full bg-secondary px-3.5 text-[13px] text-muted-foreground">
			{busy ? (
				<span className="inline-flex items-center gap-2 text-foreground">
					<span className="size-1.5 animate-pulse rounded-full bg-info" />
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
	const reduced = usePrefersReducedMotion();
	return (
		<ul className="overflow-hidden rounded-lg bg-card">
			{jobTypes.map((type, index) => {
				const problem =
					type.lastDetectionError ||
					type.policyError ||
					(!type.detectorAvailable ? "No connected worker can detect this job type." : "");
				return (
					<motion.li
						key={type.jobType}
						className="hairline-t first:border-t-0"
						initial={reduced ? false : { opacity: 0, y: 6 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.3, delay: index * 0.03, ease: [0.22, 1, 0.36, 1] }}
					>
						<Link
							to="/maintenance/$jobType"
							params={{ jobType: type.jobType }}
							className="group grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-3 px-5 py-5 transition-colors hover:bg-foreground/[0.03] focus-visible:bg-foreground/[0.04] sm:px-6 md:grid-cols-[auto_minmax(0,1fr)_11rem_11rem_auto]"
						>
							<span className="flex size-10 items-center justify-center rounded-full bg-area/15 text-area transition-transform group-hover:scale-105">
								<JobTypeIcon jobType={type.jobType} className="size-[18px]" />
							</span>
							<div className="min-w-0">
								<p className="flex flex-wrap items-center gap-2">
									<span className="font-medium">{type.displayName}</span>
									{type.enabled ? (
										<Pill tone="neutral" dot={false}>
											Scheduled
										</Pill>
									) : (
										<Pill tone="neutral" dot={false} className="bg-transparent ring-1 ring-hairline">
											Manual only
										</Pill>
									)}
								</p>
								<p className="mt-0.5 line-clamp-2 text-muted-foreground text-sm">{type.description}</p>
								{problem && <p className="mt-1.5 text-destructive-foreground text-xs">{problem}</p>}
								{!type.lastDetectionError && type.lastDetectionSkipped && (
									<p className="mt-1.5 text-muted-foreground text-xs">
										Skipped last check: {type.lastDetectionSkipped}
									</p>
								)}
							</div>
							<ArrowUpRight className="size-4 text-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground md:order-last" />
							<dl className="col-span-3 grid grid-cols-2 gap-4 pl-14 text-xs md:col-span-2 md:pl-0">
								<div>
									<dt className="flex items-center gap-1 text-muted-foreground">
										<Timer className="size-3" />
										{type.detectionInFlight ? "Checking" : "Next check"}
									</dt>
									<dd className="mt-1 text-[13px]">
										{type.detectionInFlight ? (
											<span className="text-info-foreground">now</span>
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
									</dd>
								</div>
								<div>
									<dt className="flex items-center gap-1 text-muted-foreground">
										<Search className="size-3" />
										Last run
									</dt>
									<dd className="mt-1 flex flex-wrap items-center gap-1.5">
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
					</motion.li>
				);
			})}
		</ul>
	);
}

export function WorkerRow({ worker, names }: { worker: MaintenanceWorker; names: Record<string, string> }) {
	const queued = Object.values(worker.queuedByType).reduce((sum, n) => sum + n, 0);
	return (
		<li className="py-4 first:pt-0 last:pb-0">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="truncate font-medium font-mono text-sm">{worker.address || worker.id}</p>
					<p className="text-muted-foreground text-xs">
						SeaweedFS {worker.version.split(" ")[0] || "unknown"}, connected{" "}
						{formatRelative(worker.connectedAt)}
					</p>
				</div>
				<span className="shrink-0 text-xs">
					<StatusDot tone="good" label={`Seen ${formatRelative(worker.lastSeenAt)}`} />
				</span>
			</div>
			<div className="mt-4 grid grid-cols-2 gap-4 text-xs">
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
				<ul className="mt-3 space-y-1 text-xs">
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
			<div className="mt-4 flex flex-wrap gap-1.5">
				{worker.capabilities.map((cap) => (
					<span
						key={cap.jobType}
						className="inline-flex h-6 items-center gap-1.5 rounded-full bg-foreground/[0.06] px-2.5 text-foreground/80 text-xs"
					>
						<JobTypeIcon jobType={cap.jobType} className="size-3 text-area" />
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
			<div className="pt-12 pb-10">
				<SkeletonBlock className="h-12 w-72" />
				<SkeletonBlock className="mt-5 h-8 w-96 max-w-full rounded-full" />
			</div>
			<div className="grid grid-cols-2 gap-8 py-10 sm:grid-cols-4">
				{[0, 1, 2, 3].map((i) => (
					<SkeletonBlock key={i} className="h-16" />
				))}
			</div>
			<div className="mt-16 space-y-px overflow-hidden rounded-lg">
				{[0, 1, 2, 3, 4].map((i) => (
					<SkeletonBlock key={i} className="h-24 rounded-none" />
				))}
			</div>
		</div>
	);
}
