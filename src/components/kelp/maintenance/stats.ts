import type { JobRun, MaintenanceActivity, MaintenanceJob } from "@shared/maintenance.ts";

const HOUR = 3_600_000;

/** One hour of maintenance: checks the scheduler ran, and jobs that finished, by outcome. */
export interface HourBucket {
	/** Start of the hour, ms since epoch. */
	t: number;
	checks: number;
	/** Checks that proposed at least one job. */
	found: number;
	proposals: number;
	succeeded: number;
	failed: number;
	canceled: number;
}

const time = (iso: string | null) => (iso ? new Date(iso).getTime() : Number.NaN);

/** True for the activity the scheduler records when a check for work finishes. */
export function isCheck(activity: MaintenanceActivity): boolean {
	return activity.source === "admin_scheduler" && activity.stage === "detected";
}

/** How many jobs a check proposed, read from its message ("... completed: 3 proposal(s)"). */
export function proposalsOf(activity: MaintenanceActivity): number {
	const match = /(\d+)\s+proposal/.exec(activity.message);
	return match ? Number(match[1]) : 0;
}

/**
 * The last `hours` hours, oldest first, with checks from the activity feed and finished jobs by
 * outcome. Activity before the first hour and jobs still running are left out.
 */
export function hourly(
	jobs: MaintenanceJob[],
	activities: MaintenanceActivity[],
	now: number,
	hours = 24,
): HourBucket[] {
	const end = Math.floor(now / HOUR) * HOUR + HOUR;
	const start = end - hours * HOUR;
	const buckets: HourBucket[] = Array.from({ length: hours }, (_, i) => ({
		t: start + i * HOUR,
		checks: 0,
		found: 0,
		proposals: 0,
		succeeded: 0,
		failed: 0,
		canceled: 0,
	}));
	const at = (t: number) => (t >= start && t < end ? buckets[Math.floor((t - start) / HOUR)] : undefined);
	for (const activity of activities) {
		if (!isCheck(activity)) continue;
		const bucket = at(time(activity.occurredAt));
		if (!bucket) continue;
		const proposals = proposalsOf(activity);
		bucket.checks++;
		bucket.proposals += proposals;
		if (proposals > 0) bucket.found++;
	}
	for (const job of jobs) {
		const bucket = at(time(job.completedAt));
		if (!bucket) continue;
		if (job.state === "succeeded") bucket.succeeded++;
		else if (job.state === "failed") bucket.failed++;
		else if (job.state === "canceled") bucket.canceled++;
	}
	return buckets;
}

/** How long a finished job took, from creation to completion. Null when unknown. */
export function jobDuration(job: MaintenanceJob): number | null {
	const ms = time(job.completedAt) - time(job.createdAt);
	return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

export function median(values: number[]): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2
		? (sorted[mid] as number)
		: ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

export interface TypeTime {
	jobType: string;
	jobs: number;
	totalMs: number;
	medianMs: number;
}

/** Time workers spent per job type on finished jobs, busiest first. */
export function timeByType(jobs: MaintenanceJob[]): TypeTime[] {
	const grouped = new Map<string, number[]>();
	for (const job of jobs) {
		const ms = jobDuration(job);
		if (ms === null) continue;
		grouped.set(job.jobType, [...(grouped.get(job.jobType) ?? []), ms]);
	}
	return [...grouped.entries()]
		.map(([jobType, durations]) => ({
			jobType,
			jobs: durations.length,
			totalMs: durations.reduce((a, b) => a + b, 0),
			medianMs: median(durations) as number,
		}))
		.sort((a, b) => b.totalMs - a.totalMs);
}

/** Share of finished jobs that succeeded, or null when none have finished. */
export function successRate(jobs: Array<Pick<MaintenanceJob, "state">>): number | null {
	const done = jobs.filter((j) => j.state === "succeeded" || j.state === "failed");
	if (done.length === 0) return null;
	return done.filter((j) => j.state === "succeeded").length / done.length;
}

export interface RunStats {
	runs: number;
	succeeded: number;
	failed: number;
	successRate: number | null;
	medianMs: number | null;
	longestMs: number | null;
}

/** Summary of a job type's run history. */
export function runStats(runs: JobRun[]): RunStats {
	const succeeded = runs.filter((r) => r.outcome === "success").length;
	const failed = runs.filter((r) => r.outcome === "error" || r.outcome === "failed").length;
	const durations = runs.map((r) => r.durationMs).filter((ms) => ms > 0);
	return {
		runs: runs.length,
		succeeded,
		failed,
		successRate: succeeded + failed > 0 ? succeeded / (succeeded + failed) : null,
		medianMs: median(durations),
		longestMs: durations.length > 0 ? Math.max(...durations) : null,
	};
}

/**
 * How far a job type is through its wait for the next check, 0 to 1. Null when it is not
 * scheduled or the times are unknown.
 */
export function waitProgress(lastAt: string | null, nextAt: string | null, now: number): number | null {
	const last = time(lastAt);
	const next = time(nextAt);
	if (!Number.isFinite(last) || !Number.isFinite(next) || next <= last) return null;
	return Math.min(1, Math.max(0, (now - last) / (next - last)));
}
