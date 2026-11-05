import type { MaintenanceActivity, MaintenanceJob } from "@shared/maintenance.ts";
import { BarList, clock } from "@/components/kelp/charts/index.ts";
import { StackedColumns, type StackSeries } from "../charts/stacked-columns.tsx";
import { formatDuration, humanize } from "./parts.tsx";
import { type HourBucket, hourly, timeByType } from "./stats.ts";

export const OUTCOME_SERIES: StackSeries[] = [
	{ key: "succeeded", label: "Succeeded", color: "var(--success)" },
	{ key: "failed", label: "Failed", color: "var(--destructive)" },
	{ key: "canceled", label: "Canceled", color: "var(--muted-foreground)" },
];

const CHECK_SERIES: StackSeries[] = [
	{ key: "empty", label: "Found nothing", color: "var(--data-1)" },
	{ key: "found", label: "Found work", color: "var(--data-2)" },
];

function columns(buckets: HourBucket[], pick: (b: HourBucket) => Record<string, number>) {
	return buckets.map((b) => ({ label: clock(b.t), values: pick(b) }));
}

/** Finished jobs per hour, split by outcome. */
export function OutcomesChart({ buckets, height }: { buckets: HourBucket[]; height?: number }) {
	return (
		<StackedColumns
			label="Finished jobs per hour by outcome"
			empty="No job has finished in the last 24 hours."
			series={OUTCOME_SERIES}
			{...(height ? { height } : {})}
			columns={columns(buckets, (b) => ({ succeeded: b.succeeded, failed: b.failed, canceled: b.canceled }))}
		/>
	);
}

/** Scheduled checks for work per hour, split by whether they found any. */
export function ChecksChart({ buckets, height }: { buckets: HourBucket[]; height?: number }) {
	return (
		<StackedColumns
			label="Checks for work per hour"
			empty="No scheduled check has run in the last 24 hours."
			series={CHECK_SERIES}
			{...(height ? { height } : {})}
			columns={columns(buckets, (b) => ({ empty: b.checks - b.found, found: b.found }))}
		/>
	);
}

/** Total worker time per job type, with how many jobs and the typical duration. */
export function WorkerTime({ jobs, names }: { jobs: MaintenanceJob[]; names: Record<string, string> }) {
	return (
		<BarList
			label="Worker time by job type"
			color="var(--data-3)"
			empty="No job has finished yet, so there is no time to account for."
			items={timeByType(jobs)
				.slice(0, 6)
				.map((t) => ({
					key: t.jobType,
					label: names[t.jobType] ?? humanize(t.jobType),
					value: t.totalMs,
					display: formatDuration(t.totalMs),
					extra: (
						<span className="hidden w-28 text-right text-[12px] text-muted-foreground sm:inline">
							{t.jobs} {t.jobs === 1 ? "job" : "jobs"}, {formatDuration(t.medianMs)} each
						</span>
					),
				}))}
		/>
	);
}

/** A day of hourly buckets, ending with the current hour. */
export function lastDay(jobs: MaintenanceJob[], activities: MaintenanceActivity[], now = Date.now()) {
	return hourly(jobs, activities, now, 24);
}

/** This run's duration against the job type's median, as two bars and a sentence. */
export function DurationCompare({
	ms,
	medianMs,
	runs,
}: {
	ms: number;
	medianMs: number | null;
	runs: number;
}) {
	if (medianMs === null || ms <= 0 || runs < 2) return null;
	const max = Math.max(ms, medianMs);
	const factor = ms / medianMs;
	const sentence =
		Math.abs(factor - 1) < 0.1
			? "About as long as usual."
			: factor > 1
				? `${factor.toFixed(1)}× longer than usual.`
				: `${(1 / factor).toFixed(1)}× faster than usual.`;
	return (
		<div className="mt-4 border-border border-t pt-3.5">
			<p className="text-[13px]">{sentence}</p>
			<dl className="mt-2 space-y-1.5 text-[12px]">
				{[
					{ label: "This run", value: ms, color: "var(--data-1)" },
					{ label: `Median of ${runs} runs`, value: medianMs, color: "var(--muted-foreground)" },
				].map((row) => (
					<div key={row.label} className="grid grid-cols-[8rem_1fr_4.5rem] items-center gap-3">
						<dt className="text-muted-foreground">{row.label}</dt>
						<dd className="h-1.5 overflow-hidden rounded-full bg-accent">
							<span
								className="block h-full rounded-full"
								style={{ width: `${(row.value / max) * 100}%`, background: row.color }}
							/>
						</dd>
						<dd className="text-right tabular">{formatDuration(row.value)}</dd>
					</div>
				))}
			</dl>
		</div>
	);
}

/** Time between consecutive events, credited to the earlier event: where a job spent its time. */
export function stageTimes(steps: MaintenanceActivity[]): Array<{ label: string; ms: number }> {
	const times = steps
		.map((s) => ({ label: s.message, t: s.occurredAt ? new Date(s.occurredAt).getTime() : Number.NaN }))
		.filter((s) => Number.isFinite(s.t));
	const gaps: Array<{ label: string; ms: number }> = [];
	for (let i = 0; i < times.length - 1; i++) {
		const ms = (times[i + 1]?.t as number) - (times[i]?.t as number);
		if (ms > 0) gaps.push({ label: times[i]?.label as string, ms });
	}
	return gaps.sort((a, b) => b.ms - a.ms);
}

/** The slowest steps of a job as ranked bars. */
export function StageTimes({ steps }: { steps: MaintenanceActivity[] }) {
	const gaps = stageTimes(steps).slice(0, 5);
	return (
		<BarList
			label="Time spent per step"
			color="var(--data-4)"
			empty="The timeline has no gaps to measure yet."
			items={gaps.map((gap, i) => ({
				key: `${gap.label}-${i}`,
				label: <span title={gap.label}>{gap.label.charAt(0).toUpperCase() + gap.label.slice(1)}</span>,
				value: gap.ms,
				display: formatDuration(gap.ms),
			}))}
		/>
	);
}
