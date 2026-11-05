import type { MaintenanceActivity } from "@shared/maintenance.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CircleStop } from "lucide-react";
import { ConfirmDialog } from "@/components/kelp/confirm-dialog.tsx";
import { CopyButton } from "@/components/kelp/copy-button.tsx";
import { DurationCompare, StageTimes } from "@/components/kelp/maintenance/insights.tsx";
import {
	ACTIVE_STATES,
	capitalize,
	elapsed,
	formatDuration,
	humanize,
	JobStateBadge,
	JobTypeIcon,
	KeyValues,
	sourceLabel,
	stateLabel,
} from "@/components/kelp/maintenance/parts.tsx";
import { jobDuration, runStats } from "@/components/kelp/maintenance/stats.ts";
import { ErrorState, InfoList, PageHeader, Reveal, Section, SkeletonBlock } from "@/components/kelp/page.tsx";
import {
	Timeline,
	TimelineContent,
	TimelineDate,
	TimelineHeader,
	TimelineIndicator,
	TimelineItem,
	TimelineSeparator,
	TimelineTitle,
} from "@/components/reui/timeline";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatDateTime, formatRelative } from "@/lib/format.ts";
import { maintenanceApi, maintenanceQueries } from "@/lib/maintenance-queries.ts";
import { useAction } from "@/lib/mutations.ts";
import { useCanWrite } from "@/lib/session.ts";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/maintenance/jobs/$jobId")({
	staticData: {
		section: "Operations",
		title: "Maintenance job",
		crumb: ({ jobId = "" }) => `Job ${jobId.slice(0, 8)}`,
	},
	loader: ({ context, params }) =>
		void context.queryClient.prefetchQuery(maintenanceQueries.job(params.jobId)),
	component: JobPage,
});

const PROGRESS = /\bprogress\b/i;

/**
 * The job's story, oldest first: repeated messages are dropped, and progress ticks are hidden once
 * the job has finished (while it runs, only the latest tick is kept).
 */
export function timeline(activities: MaintenanceActivity[], active: boolean): MaintenanceActivity[] {
	const sorted = [...activities].sort((a, b) => (a.occurredAt ?? "").localeCompare(b.occurredAt ?? ""));
	const lastProgress = sorted.findLast((a) => PROGRESS.test(a.message));
	const seen = new Set<string>();
	return sorted.filter((activity) => {
		if (PROGRESS.test(activity.message) && (!active || activity !== lastProgress)) return false;
		if (seen.has(activity.message)) return false;
		seen.add(activity.message);
		return true;
	});
}

function JobPage() {
	const { jobId } = Route.useParams();
	const canWrite = useCanWrite();
	const { data, error, isPending, refetch } = useQuery(maintenanceQueries.job(jobId));
	const runs = useQuery({ ...maintenanceQueries.runs(data?.job.jobType ?? ""), enabled: Boolean(data) });
	const expire = useAction({
		run: () => maintenanceApi.expire(jobId),
		success: (result) => (result.expired ? "Job expired" : "The job had already finished"),
		invalidate: [["maintenance"]],
	});

	if (isPending) return <JobSkeleton />;
	if (error) {
		return (
			<>
				<PageHeader title="Maintenance job" />
				<ErrorState error={error} onRetry={() => refetch()} />
			</>
		);
	}
	const { job, run, related } = data;
	const active = ACTIVE_STATES.has(job.state);
	const steps = timeline(data.activities, active);

	const outcome = job.errorMessage
		? { label: "Error", text: capitalize(job.errorMessage) }
		: { label: "Result", text: job.resultSummary ? capitalize(job.resultSummary) : "" };
	const duration = run ? formatDuration(run.durationMs) : elapsed(job.createdAt, job.completedAt);

	return (
		<>
			<PageHeader
				title={job.summary || humanize(job.jobType)}
				description={
					<span className="mt-1 flex flex-wrap items-center gap-3">
						<JobStateBadge state={job.state} progress={job.progress} />
						<Link
							to="/maintenance/$jobType"
							params={{ jobType: job.jobType }}
							className="inline-flex h-5 items-center gap-1 rounded-sm bg-secondary px-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
						>
							<JobTypeIcon jobType={job.jobType} className="size-3" />
							{humanize(job.jobType)}
						</Link>
					</span>
				}
				actions={
					canWrite &&
					active && (
						<ConfirmDialog
							trigger={
								<Button variant="outline">
									<CircleStop />
									Expire job
								</Button>
							}
							title="Expire this job?"
							description="Kelp marks the job as failed so it stops blocking the scheduler. Work already in progress on a worker is not rolled back."
							confirmLabel="Expire job"
							destructive
							onConfirm={() => expire.mutateAsync()}
						/>
					)
				}
			/>

			<Reveal className="grid items-start gap-x-6 gap-y-8 lg:grid-cols-12">
				<div className="space-y-8 lg:col-span-8">
					<section className="group-sheet p-4">
						{active ? (
							<>
								<p className="text-[13px] text-muted-foreground">
									{job.stage ? humanize(job.stage) : "Working"}
									{job.message && `, ${job.message}`}
								</p>
								<div className="mt-1 flex items-center gap-4">
									<p className="metric font-semibold text-[28px] leading-8">{Math.round(job.progress)}%</p>
									<Progress
										value={job.progress}
										aria-label="Job progress"
										className="flex-1 [&_[data-slot=progress-indicator]]:bg-primary [&_[data-slot=progress-track]]:h-1.5 [&_[data-slot=progress-track]]:bg-accent"
									/>
								</div>
							</>
						) : (
							<>
								<p className="text-[13px] text-muted-foreground">{outcome.label}</p>
								<p className="mt-0.5 font-semibold text-[17px] leading-[22px] tracking-[-0.012em]">
									{job.state === "succeeded" ? `Done in ${duration}` : stateLabel(job.state)}
								</p>
							</>
						)}
						{outcome.text && (
							<p
								className={cn(
									"mt-2 max-w-[75ch] text-[13px] [overflow-wrap:anywhere]",
									job.errorMessage ? "text-destructive" : "text-foreground/80",
								)}
							>
								{active && <span className="mr-2 text-muted-foreground">{outcome.label}</span>}
								{outcome.text}
							</p>
						)}
						{job.detail && <p className="mt-1 text-[12px] text-muted-foreground">{job.detail}</p>}
						{!active && (
							<DurationCompare
								ms={run?.durationMs ?? jobDuration(job) ?? 0}
								medianMs={runStats(runs.data ?? []).medianMs}
								runs={runs.data?.length ?? 0}
							/>
						)}
					</section>

					{steps.length > 2 && (
						<Section
							title="Where the time went"
							description="The longest gaps between events"
							className="mt-0"
						>
							<div className="group-sheet p-4">
								<StageTimes steps={steps} />
							</div>
						</Section>
					)}

					<Section title="Timeline" description="What happened, oldest first" className="mt-0">
						<div className="group-sheet p-4">
							{steps.length === 0 ? (
								<p className="text-[13px] text-muted-foreground">No events recorded for this job.</p>
							) : (
								<Timeline value={steps.length}>
									{steps.map((step, index) => (
										<TimelineItem key={`${step.occurredAt}-${step.stage}-${step.message}`} step={index + 1}>
											<TimelineHeader>
												<TimelineSeparator />
												<TimelineDate title={formatDateTime(step.occurredAt)}>
													{step.occurredAt ? new Date(step.occurredAt).toLocaleTimeString() : ""}
												</TimelineDate>
												<TimelineTitle className="text-[13px] [overflow-wrap:anywhere]">
													{capitalize(step.message)}
												</TimelineTitle>
												<TimelineIndicator
													className={cn(index === steps.length - 1 && "border-primary bg-primary/25")}
												/>
											</TimelineHeader>
											<TimelineContent className="text-[12px]">{sourceLabel(step.source)}</TimelineContent>
										</TimelineItem>
									))}
								</Timeline>
							)}
						</div>
					</Section>

					<Section title="Outputs" description="What the worker reported back" className="mt-0">
						<div className="group-sheet p-4">
							<KeyValues values={job.outputs} empty="This job reported no outputs." />
						</div>
					</Section>
					<Section title="Parameters" description="What the job was asked to do" className="mt-0">
						<div className="group-sheet p-4">
							<KeyValues values={job.parameters} empty="This job had no parameters." />
						</div>
					</Section>
				</div>

				<div className="space-y-8 lg:col-span-4">
					<InfoList
						items={[
							{ label: "Created", value: formatDateTime(job.createdAt) },
							{ label: "Finished", value: job.completedAt ? formatDateTime(job.completedAt) : "Not yet" },
							{ label: "Duration", value: duration },
							{ label: "Attempt", value: String(job.attempt || 1) },
							{
								label: "Worker",
								value: job.workerId ? (
									<span className="font-mono text-[12px]">{job.workerId}</span>
								) : (
									"Not assigned"
								),
							},
							{
								label: "Job id",
								value: (
									<span className="flex items-center justify-end gap-1">
										<span className="truncate font-mono text-[12px]">{job.id}</span>
										<CopyButton value={job.id} label="Copy job id" />
									</span>
								),
							},
						]}
					/>
					{related.length > 0 && (
						<Section title="Related jobs" className="mt-0">
							<ul className="group-sheet divide-y divide-border text-[13px]">
								{[...related]
									.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
									.slice(0, 8)
									.map((other) => (
										<li key={other.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
											<Link
												to="/maintenance/jobs/$jobId"
												params={{ jobId: other.id }}
												className="truncate hover:text-primary"
											>
												{other.summary || other.id}
											</Link>
											<span className="shrink-0 text-[12px] text-muted-foreground">
												{formatRelative(other.createdAt)}
											</span>
										</li>
									))}
							</ul>
						</Section>
					)}
				</div>
			</Reveal>
		</>
	);
}

function JobSkeleton() {
	return (
		<div role="status" aria-busy="true" aria-label="Loading job">
			<div className="flex items-center gap-3 pt-2 pb-6">
				<SkeletonBlock className="size-9 rounded-[9px]" />
				<div className="space-y-1.5">
					<SkeletonBlock className="h-7 w-80 max-w-full" />
					<SkeletonBlock className="h-4 w-48" />
				</div>
			</div>
			<div className="grid gap-6 lg:grid-cols-12">
				<SkeletonBlock className="h-80 rounded-xl lg:col-span-8" />
				<SkeletonBlock className="h-64 rounded-xl lg:col-span-4" />
			</div>
		</div>
	);
}
