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
import type { ReactNode } from "react";
import StatusMark, { type StatusMarkStatus } from "@/components/react-bits/StatusMark.tsx";
import { formatRelative } from "@/lib/format.ts";
import { cn } from "@/lib/utils";
import { EASE, SPEED, usePrefersReducedMotion } from "../motion.ts";
import { SkeletonBlock } from "../page.tsx";
import { RowsGhost } from "../skeletons.tsx";
import { TextMorph } from "../text-morph.tsx";

const ICONS: Record<string, LucideIcon> = {
	vacuum: Brush,
	erasure_coding: Blocks,
	ec_balance: Waypoints,
	volume_balance: Scale,
	admin_script: SquareTerminal,
	s3_lifecycle: Recycle,
	iceberg_maintenance: Snowflake,
};

/** `PageHeader`, except the title can be a node: these pages learn their title from the data. */
export function DataHeader({
	title,
	description,
	actions,
}: {
	title: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
}) {
	return (
		<div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pt-2 pb-6">
			<div className="min-w-0">
				<h1 className="truncate font-semibold text-[26px] leading-8 tracking-[-0.022em]">{title}</h1>
				{description && (
					<div className="mt-0.5 text-[13px] text-muted-foreground leading-[18px]">{description}</div>
				)}
			</div>
			{actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
		</div>
	);
}

/** A block that comes and goes inline: its height glides, so what sits below it never jumps. */
export function Collapse({
	open,
	children,
	className,
}: {
	open: boolean;
	children: ReactNode;
	className?: string;
}) {
	const reduced = usePrefersReducedMotion();
	return (
		<AnimatePresence initial={false}>
			{open && (
				<motion.div
					key="open"
					{...(className ? { className } : {})}
					initial={reduced ? false : { height: 0, opacity: 0, overflow: "hidden" }}
					// Clips only while moving: a resting block keeps its focus rings and sheet edges.
					animate={{ height: "auto", opacity: 1, transitionEnd: { overflow: "visible" } }}
					exit={
						reduced
							? { opacity: 0, transition: { duration: 0 } }
							: { height: 0, opacity: 0, overflow: "hidden" }
					}
					transition={{ duration: SPEED.base, ease: EASE }}
				>
					{children}
				</motion.div>
			)}
		</AnimatePresence>
	);
}

/**
 * A secondary query for `Loaded`: it waits while pending, but a failure shows `fallback` instead of
 * an error, for panels the page can do without.
 */
export function settled<T>(query: { data: T | undefined; error: unknown }, fallback: T) {
	return { data: query.data ?? (query.error ? fallback : undefined), error: null };
}

/** Holds a `KpiGhost` without a trend to the height of a real tile, whose hint line runs taller. */
export const KPI_TILE = "min-h-[113px]";

/** Matches a `BarList`: its rows sit further apart than plain label and value rows. */
export function BarsGhost({ rows }: { rows: number }) {
	return <RowsGhost rows={rows} className="space-y-4 py-[3px]" />;
}

/** What a table column shows while its rows load; pass as the column's `meta`. */
export const cellGhost = (width: string) => ({ skeleton: <SkeletonBlock className={cn("h-3.5", width)} /> });

/** The same for a cell of two lines: a name above its detail. */
export const twoLineGhost = {
	skeleton: (
		<div className="space-y-1.5 py-0.5">
			<SkeletonBlock className="h-3.5 w-2/5" />
			<SkeletonBlock className="h-3 w-3/5" />
		</div>
	),
};

/** Matches an `InfoList` or any sheet of label and value rows. */
export function InfoGhost({ rows, className }: { rows: number; className?: string }) {
	return (
		<div className={cn("group-sheet divide-y divide-border", className)}>
			{Array.from({ length: rows }, (_, i) => i).map((row) => (
				<div key={row} className="flex min-h-10 items-center justify-between gap-4 px-4 py-2">
					<SkeletonBlock className="h-3.5 w-24" />
					<SkeletonBlock className="h-3.5 w-32 max-w-1/2" />
				</div>
			))}
		</div>
	);
}

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

export type Tone = "success" | "danger" | "info" | "warning" | "neutral";

const TONES: Record<Tone, string> = {
	success: "bg-success/12 text-success-foreground",
	danger: "bg-destructive/12 text-destructive-foreground",
	info: "bg-info/12 text-info-foreground",
	warning: "bg-warning/14 text-warning-foreground",
	neutral: "bg-secondary text-muted-foreground",
};

/** A small status pill: tinted by its reserved status color, always with a dot and a word. */
export function Pill({
	tone,
	dot = true,
	className,
	children,
}: {
	tone: Tone;
	dot?: boolean;
	className?: string;
	children: ReactNode;
}) {
	return (
		<span
			className={cn(
				"inline-flex h-5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 font-medium text-xs",
				TONES[tone],
				className,
			)}
		>
			{dot && <span className="size-1.5 rounded-full bg-current" />}
			{children}
		</span>
	);
}

const STATE_STYLE: Record<JobState, { label: string; mark: StatusMarkStatus }> = {
	pending: { label: "Queued", mark: "pending" },
	assigned: { label: "Assigned", mark: "pending" },
	running: { label: "Running", mark: "running" },
	succeeded: { label: "Succeeded", mark: "done" },
	failed: { label: "Failed", mark: "failed" },
	canceled: { label: "Canceled", mark: "cancelled" },
	unknown: { label: "Unknown", mark: "pending" },
};

export const ACTIVE_STATES: ReadonlySet<JobState> = new Set(["pending", "assigned", "running"]);

export function stateLabel(state: JobState): string {
	return STATE_STYLE[state].label;
}

/**
 * A job's state as a React Bits StatusMark and a word: a ring that fills with progress while
 * running, then draws a check or a cross, with the word and percentage morphing along with it.
 * Color appears only for running, success and failure.
 */
export function JobStateBadge({
	state,
	progress,
	size = "sm",
}: {
	state: JobState;
	progress?: number;
	size?: "sm" | "md";
}) {
	const style = STATE_STYLE[state];
	const showProgress = state === "running" && progress !== undefined && progress > 0;
	return (
		<StatusMark
			status={style.mark}
			{...(showProgress ? { progress: progress / 100 } : {})}
			label={
				<span className="inline-flex items-center gap-1.5">
					<TextMorph>{style.label}</TextMorph>
					<TextMorph className="tabular text-muted-foreground">
						{showProgress ? `${Math.round(progress)}%` : ""}
					</TextMorph>
				</span>
			}
			color={state === "running" || state === "assigned" ? "var(--primary)" : "var(--muted-foreground)"}
			doneColor="var(--success)"
			errorColor="var(--destructive)"
			size={size === "sm" ? 14 : 18}
			strokeWidth={2}
			fontSize={size === "sm" ? 13 : 15}
			fillOpacity={0.14}
			strike={false}
			className="shrink-0 whitespace-nowrap font-medium [&>span:last-child]:opacity-100!"
		/>
	);
}

/** Outcome of a run ("success" / "error") with the same visual language as job states. */
export function OutcomeBadge({ outcome }: { outcome: string }) {
	if (outcome === "success") return <JobStateBadge state="succeeded" />;
	if (outcome === "error" || outcome === "failed") return <JobStateBadge state="failed" />;
	return <Pill tone="neutral">{capitalize(outcome) || "Unknown"}</Pill>;
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
				<pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-raised p-3 font-mono text-xs">
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
	if (entries.length === 0) return <p className="text-[13px] text-muted-foreground">{empty}</p>;
	return (
		<dl className="grid gap-x-8 gap-y-3 text-[13px] sm:grid-cols-[minmax(9rem,auto)_1fr]">
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
		return (
			<p className="py-10 text-center text-[13px] text-muted-foreground">No maintenance activity yet.</p>
		);
	}
	return (
		<ol className={cn("relative divide-y divide-border", className)}>
			<AnimatePresence initial={false}>
				{activities.map((activity) => (
					<motion.li
						key={`${activity.occurredAt}-${activity.requestId}-${activity.stage}-${activity.message}`}
						layout={!reduced}
						initial={reduced ? false : { opacity: 0, y: -8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0 }}
						transition={{ duration: SPEED.base, ease: EASE }}
						className="grid grid-cols-[auto_1fr_auto] items-start gap-3 px-4 py-2.5"
					>
						<span className="mt-px flex size-6 items-center justify-center rounded-md bg-raised text-muted-foreground">
							<JobTypeIcon jobType={activity.jobType} className="size-3.5" />
						</span>
						<div className="min-w-0">
							<p className="text-[13px] leading-[18px] [overflow-wrap:anywhere]">
								{activity.jobId ? (
									<Link
										to="/maintenance/jobs/$jobId"
										params={{ jobId: activity.jobId }}
										className="hover:text-primary"
									>
										{capitalize(activity.message)}
									</Link>
								) : (
									capitalize(activity.message)
								)}
							</p>
							{showJobType && (
								<p className="text-[12px] text-muted-foreground">
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
