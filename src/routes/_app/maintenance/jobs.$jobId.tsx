import type { JobDetail, JobRun, MaintenanceActivity } from "@shared/maintenance.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CircleStop } from "lucide-react";
import { ConfirmDialog } from "@/components/kelp/confirm-dialog.tsx";
import { CopyButton } from "@/components/kelp/copy-button.tsx";
import { DurationCompare, StageTimes } from "@/components/kelp/maintenance/insights.tsx";
import {
	ACTIVE_STATES,
	BarsGhost,
	Collapse,
	capitalize,
	DataHeader,
	elapsed,
	formatDuration,
	humanize,
	InfoGhost,
	JobStateBadge,
	JobTypeIcon,
	KeyValues,
	sourceLabel,
	stateLabel,
} from "@/components/kelp/maintenance/parts.tsx";
import { jobDuration, runStats } from "@/components/kelp/maintenance/stats.ts";
import { InfoList, Section, SkeletonBlock } from "@/components/kelp/page.tsx";
import { LoadingRegion, RowsGhost } from "@/components/kelp/skeletons.tsx";
import { RollingValue, TextMorph } from "@/components/kelp/text-morph.tsx";
import { Loaded, Swap } from "@/components/kelp/transitions.tsx";
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
	const query = useQuery(maintenanceQueries.job(jobId));
	const { data, error } = query;
	const runs = useQuery({ ...maintenanceQueries.runs(data?.job.jobType ?? ""), enabled: Boolean(data) });
	const expire = useAction({
		run: () => maintenanceApi.expire(jobId),
		success: (result) => (result.expired ? "Job expired" : "The job had already finished"),
		invalidate: [["maintenance"]],
	});
	const title = data ? data.job.summary || humanize(data.job.jobType) : error ? "Maintenance job" : null;
	const expirable = canWrite && data && ACTIVE_STATES.has(data.job.state);

	return (
		<>
			<DataHeader
				title={
					<Swap id={title ?? "loading"}>
						{title ? (
							<span className="block truncate">{title}</span>
						) : (
							<SkeletonBlock className="my-1 h-6 w-80 max-w-full" />
						)}
					</Swap>
				}
				description={
					data ? (
						<span className="mt-1 flex flex-wrap items-center gap-3">
							<JobStateBadge state={data.job.state} progress={data.job.progress} />
							<Link
								to="/maintenance/$jobType"
								params={{ jobType: data.job.jobType }}
								className="inline-flex h-5 items-center gap-1 rounded-sm bg-secondary px-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
							>
								<JobTypeIcon jobType={data.job.jobType} className="size-3" />
								{humanize(data.job.jobType)}
							</Link>
						</span>
					) : (
						!error && <SkeletonBlock className="mt-1 h-5 w-48" />
					)
				}
				actions={
					<Swap id={expirable ? "expire" : "none"}>
						{expirable && (
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
						)}
					</Swap>
				}
			/>
			<Loaded query={query} skeleton={<JobSkeleton />}>
				{(detail) => <JobBody data={detail} runs={runs.data} />}
			</Loaded>
		</>
	);
}

/** What the job is doing now, or how it ended. */
function JobStatus({ data, runs }: { data: JobDetail; runs: JobRun[] | undefined }) {
	const { job, run } = data;
	const active = ACTIVE_STATES.has(job.state);
	const outcome = job.errorMessage
		? { label: "Error", text: capitalize(job.errorMessage) }
		: { label: "Result", text: job.resultSummary ? capitalize(job.resultSummary) : "" };
	const duration = run ? formatDuration(run.durationMs) : elapsed(job.createdAt, job.completedAt);
	const doing = `${job.stage ? humanize(job.stage) : "Working"}${job.message ? `, ${job.message}` : ""}`;
	return (
		<section className="group-sheet p-4">
			<Swap id={active ? "active" : "finished"}>
				{active ? (
					<>
						<p className="text-[13px] text-muted-foreground" title={doing}>
							<TextMorph className="block overflow-hidden">{doing}</TextMorph>
						</p>
						<div className="mt-1 flex items-center gap-4">
							<p className="metric font-semibold text-[28px] leading-8">
								<RollingValue text={`${Math.round(job.progress)}%`} />
							</p>
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
							<TextMorph>
								{job.state === "succeeded" ? `Done in ${duration}` : stateLabel(job.state)}
							</TextMorph>
						</p>
					</>
				)}
			</Swap>
			<Collapse open={Boolean(outcome.text)}>
				<p
					className={cn(
						"mt-2 max-w-[75ch] text-[13px] [overflow-wrap:anywhere]",
						job.errorMessage ? "text-destructive" : "text-foreground/80",
					)}
				>
					{active && <span className="mr-2 text-muted-foreground">{outcome.label}</span>}
					{outcome.text}
				</p>
			</Collapse>
			<Collapse open={Boolean(job.detail)}>
				<p className="mt-1 text-[12px] text-muted-foreground">{job.detail}</p>
			</Collapse>
			<Collapse open={!active && runs !== undefined}>
				<DurationCompare
					ms={run?.durationMs ?? jobDuration(job) ?? 0}
					medianMs={runStats(runs ?? []).medianMs}
					runs={runs?.length ?? 0}
				/>
			</Collapse>
		</section>
	);
}

function JobBody({ data, runs }: { data: JobDetail; runs: JobRun[] | undefined }) {
	const { job, run, related } = data;
	const active = ACTIVE_STATES.has(job.state);
	const steps = timeline(data.activities, active);
	const duration = run ? formatDuration(run.durationMs) : elapsed(job.createdAt, job.completedAt);

	return (
		<div className="grid grid-cols-[minmax(0,1fr)] items-start gap-x-6 gap-y-8 lg:grid-cols-12">
			<div className="min-w-0 space-y-8 lg:col-span-8">
				<JobStatus data={data} runs={runs} />

				<Collapse open={steps.length > 2}>
					<Section title="Where the time went" description="The longest gaps between events" className="mt-0">
						<div className="group-sheet p-4">
							<StageTimes steps={steps} />
						</div>
					</Section>
				</Collapse>

				<Section title="Timeline" description="What happened, oldest first" className="mt-0">
					<div className="group-sheet p-4">
						{steps.length === 0 ? (
							<p className="text-[13px] text-muted-foreground">No events recorded for this job.</p>
						) : (
							<Timeline value={steps.length}>
								{steps.map((step, index) => (
									<TimelineItem
										key={
											// The one progress row stays put and morphs from tick to tick.
											PROGRESS.test(step.message)
												? "progress"
												: `${step.occurredAt}-${step.stage}-${step.message}`
										}
										step={index + 1}
									>
										<TimelineHeader>
											<TimelineSeparator />
											<TimelineDate title={formatDateTime(step.occurredAt)}>
												{step.occurredAt ? new Date(step.occurredAt).toLocaleTimeString() : ""}
											</TimelineDate>
											<TimelineTitle className="text-[13px] [overflow-wrap:anywhere]">
												{PROGRESS.test(step.message) ? (
													<TextMorph className="block overflow-hidden">{capitalize(step.message)}</TextMorph>
												) : (
													capitalize(step.message)
												)}
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
						{
							label: "Finished",
							value: <TextMorph>{job.completedAt ? formatDateTime(job.completedAt) : "Not yet"}</TextMorph>,
						},
						{ label: "Duration", value: <TextMorph>{duration}</TextMorph> },
						{ label: "Attempt", value: <TextMorph>{String(job.attempt || 1)}</TextMorph> },
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
		</div>
	);
}

function JobSkeleton() {
	return (
		<LoadingRegion label="Loading job">
			<div className="grid grid-cols-[minmax(0,1fr)] items-start gap-x-6 gap-y-8 lg:grid-cols-12">
				<div className="min-w-0 space-y-8 lg:col-span-8">
					<div className="group-sheet min-h-[105px] p-4">
						<SkeletonBlock className="my-0.5 h-3.5 w-16" />
						<SkeletonBlock className="mt-1 h-5 w-40" />
						<SkeletonBlock className="mt-3 h-3.5 w-3/5" />
					</div>
					<Section title="Where the time went" description="The longest gaps between events" className="mt-0">
						<div className="group-sheet p-4">
							<BarsGhost rows={3} />
						</div>
					</Section>
					<Section title="Timeline" description="What happened, oldest first" className="mt-0">
						<div className="group-sheet p-4">
							<RowsGhost rows={5} className="space-y-[72px]" />
						</div>
					</Section>
					<Section title="Outputs" description="What the worker reported back" className="mt-0">
						<div className="group-sheet p-4">
							<RowsGhost rows={2} />
						</div>
					</Section>
					<Section title="Parameters" description="What the job was asked to do" className="mt-0">
						<div className="group-sheet p-4">
							<RowsGhost rows={2} />
						</div>
					</Section>
				</div>
				<div className="min-w-0 space-y-8 lg:col-span-4">
					<InfoGhost rows={6} />
				</div>
			</div>
		</LoadingRegion>
	);
}
