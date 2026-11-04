import type { MaintenanceActivity } from "@shared/maintenance.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CircleStop } from "lucide-react";
import { ConfirmDialog } from "@/components/kelp/confirm-dialog.tsx";
import { CopyButton } from "@/components/kelp/copy-button.tsx";
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
import { AuroraCard, ErrorState, PageHeader, Panel, Reveal, SkeletonBlock } from "@/components/kelp/page.tsx";
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
					<span className="flex flex-wrap items-center gap-2">
						<JobStateBadge state={job.state} progress={job.progress} />
						<Link
							to="/maintenance/$jobType"
							params={{ jobType: job.jobType }}
							className="inline-flex h-6 items-center gap-1.5 rounded-full bg-foreground/[0.06] px-2.5 text-foreground/80 text-xs transition-colors hover:bg-foreground/10 hover:text-foreground"
						>
							<JobTypeIcon jobType={job.jobType} className="size-3.5 text-area" />
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

			<Reveal>
				<AuroraCard className="mb-4 grid gap-10 p-7 sm:p-8 lg:grid-cols-[1.3fr_1fr] lg:items-end">
					<div className="min-w-0">
						{active ? (
							<>
								<p className="text-[13px] text-foreground/70">
									{job.stage ? humanize(job.stage) : "Working"}
									{job.message && `, ${job.message}`}
								</p>
								<p className="mt-3 font-[450] text-6xl leading-none tracking-[-0.04em] tabular">
									{Math.round(job.progress)}%
								</p>
								<Progress
									value={job.progress}
									aria-label="Job progress"
									className="mt-6 [&_[data-slot=progress-indicator]]:bg-area [&_[data-slot=progress-track]]:h-2 [&_[data-slot=progress-track]]:bg-foreground/10"
								/>
								{outcome.text && (
									<p className="mt-4 flex flex-wrap gap-x-2 text-[15px]">
										<span className="text-foreground/70">{outcome.label}</span>
										<span
											className={cn(
												"[overflow-wrap:anywhere]",
												job.errorMessage ? "text-destructive-foreground" : "text-foreground/80",
											)}
										>
											{outcome.text}
										</span>
									</p>
								)}
							</>
						) : (
							<>
								<p className="text-[13px] text-foreground/70">{outcome.label}</p>
								<p className="mt-3 font-[450] text-4xl leading-[1.05] tracking-[-0.03em] sm:text-5xl">
									{job.state === "succeeded" ? `Done in ${duration}` : stateLabel(job.state)}
								</p>
								{outcome.text && (
									<p
										className={cn(
											"mt-4 max-w-[60ch] text-[15px] [overflow-wrap:anywhere]",
											job.errorMessage ? "text-destructive-foreground" : "text-foreground/80",
										)}
									>
										{outcome.text}
									</p>
								)}
							</>
						)}
						{job.detail && <p className="mt-2 text-[13px] text-foreground/70">{job.detail}</p>}
					</div>
					<dl className="grid grid-cols-2 gap-x-6 gap-y-5 text-sm">
						<Fact label="Created" value={formatDateTime(job.createdAt)} />
						<Fact label="Finished" value={job.completedAt ? formatDateTime(job.completedAt) : "Not yet"} />
						<Fact label="Duration" value={duration} />
						<Fact label="Attempt" value={String(job.attempt || 1)} />
					</dl>
				</AuroraCard>
			</Reveal>

			<Reveal delay={0.05} className="grid items-start gap-4 lg:grid-cols-[1fr_24rem]">
				<Panel title="Timeline" description="What happened, oldest first">
					{steps.length === 0 ? (
						<p className="text-muted-foreground text-sm">No events recorded for this job.</p>
					) : (
						<Timeline value={steps.length}>
							{steps.map((step, index) => (
								<TimelineItem key={`${step.occurredAt}-${step.stage}-${step.message}`} step={index + 1}>
									<TimelineHeader>
										<TimelineSeparator />
										<TimelineDate title={formatDateTime(step.occurredAt)}>
											{step.occurredAt ? new Date(step.occurredAt).toLocaleTimeString() : ""}
										</TimelineDate>
										<TimelineTitle className="[overflow-wrap:anywhere]">
											{capitalize(step.message)}
										</TimelineTitle>
										<TimelineIndicator
											className={cn(index === steps.length - 1 && "border-area bg-area/25")}
										/>
									</TimelineHeader>
									<TimelineContent>{sourceLabel(step.source)}</TimelineContent>
								</TimelineItem>
							))}
						</Timeline>
					)}
				</Panel>

				<div className="space-y-4">
					<Panel title="Outputs" description="What the worker reported back">
						<KeyValues values={job.outputs} empty="This job reported no outputs." />
					</Panel>
					<Panel title="Parameters" description="What the job was asked to do">
						<KeyValues values={job.parameters} empty="This job had no parameters." />
					</Panel>
					<Panel title="Where it ran">
						<dl className="grid gap-4 text-sm">
							<Fact label="Worker" value={job.workerId || "Not assigned"} mono={Boolean(job.workerId)} />
							<div>
								<dt className="text-muted-foreground text-xs">Job id</dt>
								<dd className="mt-0.5 flex items-center gap-1">
									<span className="min-w-0 break-all font-mono text-xs">{job.id}</span>
									<CopyButton value={job.id} label="Copy job id" />
								</dd>
							</div>
						</dl>
					</Panel>
					{related.length > 0 && (
						<Panel title="Related jobs">
							<ul className="divide-y divide-hairline text-sm">
								{[...related]
									.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
									.slice(0, 8)
									.map((other) => (
										<li
											key={other.id}
											className="flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
										>
											<Link
												to="/maintenance/jobs/$jobId"
												params={{ jobId: other.id }}
												className="truncate hover:underline"
											>
												{other.summary || other.id}
											</Link>
											<span className="shrink-0 text-muted-foreground text-xs">
												{formatRelative(other.createdAt)}
											</span>
										</li>
									))}
							</ul>
						</Panel>
					)}
				</div>
			</Reveal>
		</>
	);
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
	return (
		<div>
			<dt className="text-[13px] text-muted-foreground">{label}</dt>
			<dd className={cn("mt-0.5", mono && "break-all font-mono text-xs")}>{value}</dd>
		</div>
	);
}

function JobSkeleton() {
	return (
		<div role="status" aria-busy="true" aria-label="Loading job">
			<div className="pt-12 pb-10">
				<SkeletonBlock className="h-12 w-96 max-w-full" />
				<SkeletonBlock className="mt-5 h-6 w-48 rounded-full" />
			</div>
			<SkeletonBlock className="mb-4 h-48 rounded-2xl" />
			<div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
				<SkeletonBlock className="h-96 rounded-lg" />
				<SkeletonBlock className="h-72 rounded-lg" />
			</div>
		</div>
	);
}
