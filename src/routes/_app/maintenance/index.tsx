import type { JobTypeSummary, MaintenanceOverview, MaintenanceWorker } from "@shared/maintenance.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, Bot, CircleCheck, CircleX, ListChecks, Search, Timer } from "lucide-react";
import { motion } from "motion/react";
import {
	ACTIVE_STATES,
	ActivityFeed,
	condenseActivities,
	formatInterval,
	humanize,
	JobTypeIcon,
	OutcomeBadge,
} from "@/components/kelp/maintenance/parts.tsx";
import { usePrefersReducedMotion } from "@/components/kelp/motion.ts";
import {
	CapacityBar,
	EmptyState,
	ErrorState,
	PageHeader,
	Panel,
	Reveal,
	SkeletonBlock,
	StatTile,
	StatusDot,
} from "@/components/kelp/page.tsx";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/format.ts";
import { maintenanceQueries } from "@/lib/maintenance-queries.ts";

export const Route = createFileRoute("/_app/maintenance/")({
	staticData: { section: "Operations", title: "Maintenance" },
	loader: ({ context }) =>
		Promise.all([
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
	const failing = overview.jobTypes.filter((t) => t.lastRunStatus && t.lastRunStatus !== "success");
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
				description={<StatusDot tone={summary.tone} label={summary.text} />}
				actions={
					<Button variant="outline" render={<Link to="/maintenance/jobs" />}>
						<ListChecks />
						All jobs
					</Button>
				}
			/>

			<Reveal className="grid grid-cols-2 gap-4 lg:grid-cols-4">
				<StatTile
					label="Workers"
					value={data.workerCount}
					icon={<Bot />}
					hint="Connected to the admin server"
				/>
				<StatTile label="Running now" value={active} icon={<Activity />} hint="Queued, assigned or running" />
				<StatTile
					label="Finished today"
					value={recent.length - failed}
					icon={<CircleCheck />}
					hint="Completed in the last 24 hours"
				/>
				<StatTile label="Failed today" value={failed} icon={<CircleX />} hint="Open a job to see why" />
			</Reveal>

			<Reveal delay={0.05} className="mt-6">
				<div className="mb-3 flex items-baseline justify-between gap-3">
					<h2 className="font-medium">Job types</h2>
					<SchedulerLine overview={data} />
				</div>
				{data.jobTypes.length === 0 ? (
					<EmptyState
						icon={<Bot />}
						title="No job types yet"
						description="Job types appear once a worker connects and tells the admin server what it can do."
					/>
				) : (
					<JobTypeGrid jobTypes={data.jobTypes} />
				)}
			</Reveal>

			<Reveal delay={0.1} className="mt-6 grid items-start gap-4 lg:grid-cols-[1.3fr_1fr]">
				<Panel
					title="Activity"
					description="Detections, dispatches and results as they happen"
					actions={<span className="size-2 animate-pulse rounded-full bg-success" aria-hidden="true" />}
				>
					{activities.isPending ? (
						<div className="space-y-2">
							{[0, 1, 2, 3, 4].map((i) => (
								<SkeletonBlock key={i} className="h-10" />
							))}
						</div>
					) : activities.error ? (
						<ErrorState error={activities.error} onRetry={() => activities.refetch()} />
					) : (
						<ActivityFeed
							activities={condenseActivities(activities.data)}
							names={names}
							className="max-h-[28rem] overflow-y-auto"
						/>
					)}
				</Panel>
				<div className="space-y-4">
					<Panel title="Workers" description="Processes that detect and run maintenance jobs">
						{data.workers.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								No workers are connected. Start one with{" "}
								<span className="font-mono">weed worker -admin=&lt;admin address&gt;</span>.
							</p>
						) : (
							<ul className="space-y-4">
								{data.workers.map((worker) => (
									<WorkerRow key={worker.id} worker={worker} names={names} />
								))}
							</ul>
						)}
					</Panel>
					<Panel title="Lanes" description="Job types in a lane take turns; lanes run side by side">
						<ul className="divide-y">
							{data.lanes.map((lane) => (
								<li
									key={lane.name}
									className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
								>
									<div className="min-w-0">
										<p className="font-medium text-sm">{lane.name}</p>
										<p className="text-muted-foreground text-xs">
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
		<p className="text-muted-foreground text-xs">
			{busy ? (
				<span className="inline-flex items-center gap-1.5 text-foreground">
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

function JobTypeGrid({ jobTypes }: { jobTypes: JobTypeSummary[] }) {
	const reduced = usePrefersReducedMotion();
	return (
		<ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
			{jobTypes.map((type, index) => (
				<motion.li
					key={type.jobType}
					initial={reduced ? false : { opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.3, delay: index * 0.03, ease: [0.22, 1, 0.36, 1] }}
				>
					<Link
						to="/maintenance/$jobType"
						params={{ jobType: type.jobType }}
						className="group flex h-full flex-col rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
					>
						<div className="flex items-start gap-3">
							<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform group-hover:scale-105">
								<JobTypeIcon jobType={type.jobType} className="size-[18px]" />
							</span>
							<div className="min-w-0 flex-1">
								<div className="flex items-center justify-between gap-2">
									<p className="truncate font-medium">{type.displayName}</p>
									{type.enabled ? (
										<Badge variant="primary-light">Scheduled</Badge>
									) : (
										<Badge variant="outline">Manual only</Badge>
									)}
								</div>
								<p className="mt-0.5 line-clamp-2 text-muted-foreground text-sm">{type.description}</p>
							</div>
						</div>
						<dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-3 text-xs">
							<div>
								<dt className="flex items-center gap-1 text-muted-foreground">
									<Timer className="size-3" />
									{type.detectionInFlight ? "Checking" : "Next check"}
								</dt>
								<dd className="mt-0.5">
									{type.detectionInFlight ? (
										<span className="text-info">now</span>
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
								<dd className="mt-0.5 flex items-center gap-1.5">
									{type.lastRunStatus ? (
										<>
											<OutcomeBadge outcome={type.lastRunStatus} />
											<span className="text-muted-foreground">{formatRelative(type.lastRunCompletedAt)}</span>
										</>
									) : (
										<span className="text-muted-foreground">Not yet</span>
									)}
								</dd>
							</div>
						</dl>
						{(type.lastDetectionError || type.policyError || !type.detectorAvailable) && (
							<p className="mt-3 rounded-md bg-destructive/10 px-2 py-1.5 text-destructive text-xs">
								{type.lastDetectionError ||
									type.policyError ||
									"No connected worker can detect this job type."}
							</p>
						)}
						{!type.lastDetectionError && type.lastDetectionSkipped && (
							<p className="mt-3 text-muted-foreground text-xs">
								Skipped last check: {type.lastDetectionSkipped}
							</p>
						)}
					</Link>
				</motion.li>
			))}
		</ul>
	);
}

export function WorkerRow({ worker, names }: { worker: MaintenanceWorker; names: Record<string, string> }) {
	const queued = Object.values(worker.queuedByType).reduce((sum, n) => sum + n, 0);
	return (
		<li>
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
			<div className="mt-3 grid grid-cols-2 gap-3 text-xs">
				<div>
					<p className="mb-1 flex justify-between text-muted-foreground">
						<span>Detection slots</span>
						<span className="tabular">
							{worker.detectionSlots.used}/{worker.detectionSlots.total}
						</span>
					</p>
					<CapacityBar used={worker.detectionSlots.used} total={worker.detectionSlots.total} />
				</div>
				<div>
					<p className="mb-1 flex justify-between text-muted-foreground">
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
			<div className="mt-3 flex flex-wrap gap-1">
				{worker.capabilities.map((cap) => (
					<Badge key={cap.jobType} variant="outline" className="gap-1 font-normal">
						<JobTypeIcon jobType={cap.jobType} className="size-3" />
						{cap.displayName}
					</Badge>
				))}
			</div>
		</li>
	);
}

function MaintenanceSkeleton() {
	return (
		<div role="status" aria-busy="true" aria-label="Loading maintenance">
			<SkeletonBlock className="mt-2 mb-6 h-8 w-56" />
			<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
				{[0, 1, 2, 3].map((i) => (
					<SkeletonBlock key={i} className="h-24 rounded-xl" />
				))}
			</div>
			<div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
				{[0, 1, 2, 3, 4, 5].map((i) => (
					<SkeletonBlock key={i} className="h-40 rounded-xl" />
				))}
			</div>
		</div>
	);
}
