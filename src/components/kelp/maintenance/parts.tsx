import type { DisplayValue, JobState, MaintenanceActivity } from "@shared/maintenance.ts";
import { Link } from "@tanstack/react-router";
import {
	Blocks,
	Brush,
	Cog,
	type LucideIcon,
	Recycle,
	Scale,
	Snowflake,
	SquareTerminal,
	Waypoints,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Badge } from "@/components/reui/badge";
import { formatRelative } from "@/lib/format.ts";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "../motion.ts";

const ICONS: Record<string, LucideIcon> = {
	vacuum: Brush,
	erasure_coding: Blocks,
	ec_balance: Waypoints,
	volume_balance: Scale,
	admin_script: SquareTerminal,
	s3_lifecycle: Recycle,
	iceberg_maintenance: Snowflake,
};

export function JobTypeIcon({ jobType, className }: { jobType: string; className?: string }) {
	const Icon = ICONS[jobType] ?? Cog;
	return <Icon className={className} aria-hidden="true" />;
}

/** `erasure_coding` → "Erasure coding", for job types whose display name is unknown. */
export function humanize(jobType: string): string {
	const words = jobType.replace(/_/g, " ").trim();
	return words ? words[0]?.toUpperCase() + words.slice(1) : "Unknown";
}

/** "job assigned" → "Job assigned". */
export function capitalize(text: string): string {
	return text ? text[0]?.toUpperCase() + text.slice(1) : text;
}

const SOURCES: Record<string, string> = {
	admin_scheduler: "Scheduler",
	admin_dispatch: "Dispatcher",
	detector: "Detector",
	worker_detection: "Worker",
	worker_progress: "Worker",
	executor: "Worker",
};

/** Who reported an activity, in plain words. */
export function sourceLabel(source: string): string {
	const key = source.replace(/^activity_source_/, "");
	return SOURCES[key] ?? humanize(key);
}

const STATE_STYLE: Record<
	JobState,
	{
		label: string;
		variant: "success-light" | "destructive-light" | "info-light" | "warning-light" | "outline";
	}
> = {
	pending: { label: "Queued", variant: "outline" },
	assigned: { label: "Assigned", variant: "info-light" },
	running: { label: "Running", variant: "info-light" },
	succeeded: { label: "Succeeded", variant: "success-light" },
	failed: { label: "Failed", variant: "destructive-light" },
	canceled: { label: "Canceled", variant: "warning-light" },
	unknown: { label: "Unknown", variant: "outline" },
};

export const ACTIVE_STATES: ReadonlySet<JobState> = new Set(["pending", "assigned", "running"]);

export function stateLabel(state: JobState): string {
	return STATE_STYLE[state].label;
}

export function JobStateBadge({ state, progress }: { state: JobState; progress?: number }) {
	const style = STATE_STYLE[state];
	return (
		<Badge variant={style.variant} className="gap-1.5">
			{state === "running" && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
			{style.label}
			{state === "running" && progress !== undefined && progress > 0 && (
				<span className="tabular opacity-80">{Math.round(progress)}%</span>
			)}
		</Badge>
	);
}

/** Outcome of a run ("success" / "error") with the same visual language as job states. */
export function OutcomeBadge({ outcome }: { outcome: string }) {
	if (outcome === "success") return <JobStateBadge state="succeeded" />;
	if (outcome === "error" || outcome === "failed") return <JobStateBadge state="failed" />;
	return <Badge variant="outline">{capitalize(outcome) || "Unknown"}</Badge>;
}

/** 4193 → "4.2 s", 125000 → "2 min 5 s", 5400000 → "1 hr 30 min". */
export function formatDuration(ms: number): string {
	if (!Number.isFinite(ms) || ms <= 0) return "—";
	if (ms < 1000) return `${Math.round(ms)} ms`;
	const seconds = ms / 1000;
	if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) {
		const rest = Math.round(seconds % 60);
		return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
	}
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

/** 17 → "every 17 min", 60 → "every hour", 1440 → "every day". */
export function formatInterval(minutes: number): string {
	if (minutes <= 0) return "";
	if (minutes % 1440 === 0) return minutes === 1440 ? "every day" : `every ${minutes / 1440} days`;
	if (minutes % 60 === 0) return minutes === 60 ? "every hour" : `every ${minutes / 60} hr`;
	return `every ${minutes} min`;
}

/**
 * Workers report progress many times per job. Keep only the newest progress event of each job so
 * the feed shows what happened, not every tick.
 */
export function condenseActivities(activities: MaintenanceActivity[]): MaintenanceActivity[] {
	const seen = new Set<string>();
	return activities.filter((activity) => {
		if (!activity.jobId || !/\bprogress\b/i.test(activity.message)) return true;
		if (seen.has(activity.jobId)) return false;
		seen.add(activity.jobId);
		return true;
	});
}

/** Elapsed time between two ISO timestamps, or "—". */
export function elapsed(from: string | null, to: string | null): string {
	if (!from || !to) return "—";
	return formatDuration(new Date(to).getTime() - new Date(from).getTime());
}

/** Renders a job parameter or output; long or multi-line text becomes a scrollable block. */
export function ValueView({ value }: { value: DisplayValue }) {
	if (value === null || value === "") return <span className="text-muted-foreground">—</span>;
	if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
	if (typeof value === "number") return <span className="tabular">{value.toLocaleString("en-US")}</span>;
	if (typeof value === "string") {
		if (value.includes("\n") || value.length > 80) {
			return (
				<pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted/60 p-3 font-mono text-xs">
					{value}
				</pre>
			);
		}
		return <span className="break-all font-mono text-xs">{value}</span>;
	}
	if (Array.isArray(value)) {
		if (value.length === 0) return <span className="text-muted-foreground">None</span>;
		return (
			<ul className="space-y-1">
				{value.map((item, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: values are positional and may repeat.
					<li key={index}>
						<ValueView value={item} />
					</li>
				))}
			</ul>
		);
	}
	return <KeyValues values={value} />;
}

export function KeyValues({
	values,
	empty = "Nothing recorded.",
}: {
	values: Record<string, DisplayValue>;
	empty?: string;
}) {
	const entries = Object.entries(values);
	if (entries.length === 0) return <p className="text-muted-foreground text-sm">{empty}</p>;
	return (
		<dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[minmax(8rem,auto)_1fr]">
			{entries.map(([key, value]) => (
				<div key={key} className="contents">
					<dt className="text-muted-foreground">{humanize(key)}</dt>
					<dd className="min-w-0">
						<ValueView value={value} />
					</dd>
				</div>
			))}
		</dl>
	);
}

/** Newest-first maintenance events; new rows slide in as the feed refreshes. */
export function ActivityFeed({
	activities,
	names,
	showJobType = true,
	className,
}: {
	activities: MaintenanceActivity[];
	names?: Record<string, string>;
	showJobType?: boolean;
	className?: string;
}) {
	const reduced = usePrefersReducedMotion();
	if (activities.length === 0) {
		return <p className="py-6 text-center text-muted-foreground text-sm">No maintenance activity yet.</p>;
	}
	return (
		<ol className={cn("relative space-y-0.5", className)}>
			<AnimatePresence initial={false}>
				{activities.map((activity) => (
					<motion.li
						key={`${activity.occurredAt}-${activity.requestId}-${activity.stage}-${activity.message}`}
						layout={!reduced}
						initial={reduced ? false : { opacity: 0, y: -8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
						className="grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-lg px-2 py-2 hover:bg-muted/50"
					>
						<span className="mt-0.5 flex size-6 items-center justify-center rounded-md bg-muted text-muted-foreground">
							<JobTypeIcon jobType={activity.jobType} className="size-3.5" />
						</span>
						<div className="min-w-0">
							<p className="text-sm leading-snug">
								{activity.jobId ? (
									<Link
										to="/maintenance/jobs/$jobId"
										params={{ jobId: activity.jobId }}
										className="hover:underline"
									>
										{capitalize(activity.message)}
									</Link>
								) : (
									capitalize(activity.message)
								)}
							</p>
							{showJobType && (
								<p className="text-muted-foreground text-xs">
									{names?.[activity.jobType] ?? humanize(activity.jobType)}
									{`, ${sourceLabel(activity.source).toLowerCase()}`}
								</p>
							)}
						</div>
						<time
							className="shrink-0 text-muted-foreground text-xs tabular"
							dateTime={activity.occurredAt ?? undefined}
						>
							{formatRelative(activity.occurredAt)}
						</time>
					</motion.li>
				))}
			</AnimatePresence>
		</ol>
	);
}
