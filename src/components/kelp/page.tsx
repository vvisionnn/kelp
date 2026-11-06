import { AlertTriangle, RotateCw } from "lucide-react";
import { motion } from "motion/react";
import { type ReactNode, useId } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api.ts";
import { formatPercent, ratio } from "@/lib/format.ts";
import { cn } from "@/lib/utils";
import { EASE, SPEED, useArriving, usePrefersReducedMotion } from "./motion.ts";
import { RollingValue } from "./text-morph.tsx";

export function PageHeader({
	title,
	description,
	actions,
}: {
	title: string;
	description?: ReactNode;
	actions?: ReactNode;
}) {
	return (
		// The title block claims a fixed share before the actions, and its description stays on one
		// line beside them, so whether the actions wrap never depends on what the description says.
		<div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pt-2 pb-6">
			<div className="min-w-0 flex-1 basis-64">
				<h1 className="truncate font-semibold text-[26px] leading-8 tracking-[-0.022em]">{title}</h1>
				{description && (
					<div className="mt-0.5 text-[13px] text-muted-foreground leading-[18px] sm:truncate">
						{description}
					</div>
				)}
			</div>
			{actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
		</div>
	);
}

/** A titled block of a page: section title and optional actions above, content below. */
export function Section({
	title,
	description,
	actions,
	children,
	className,
}: {
	title: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	const titleId = useId();
	return (
		<section aria-labelledby={titleId} className={cn("mt-8 first:mt-0", className)}>
			<header className="mb-3 flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 id={titleId} className="font-semibold text-[17px] leading-[22px] tracking-[-0.012em]">
						{title}
					</h2>
					{description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
				</div>
				{actions && <div className="flex items-center gap-2">{actions}</div>}
			</header>
			{children}
		</section>
	);
}

/** Page content that settles in once, the first time it renders. */
export function Reveal({
	children,
	className,
	delay = 0,
}: {
	children: ReactNode;
	className?: string;
	delay?: number;
}) {
	const reduced = usePrefersReducedMotion();
	return (
		<motion.div
			className={className}
			initial={reduced ? false : { opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: SPEED.slow, ease: EASE, delay }}
		>
			{children}
		</motion.div>
	);
}

export function Panel({
	title,
	description,
	actions,
	children,
	className,
}: {
	title?: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	const titleId = useId();
	return (
		<section
			aria-labelledby={title ? titleId : undefined}
			className={cn("group-sheet min-w-0 text-card-foreground", className)}
		>
			{(title || actions) && (
				<header className="flex items-start justify-between gap-3 px-4 pt-3.5">
					<div>
						{title && (
							<h2 id={titleId} className="font-semibold text-[13px] leading-[18px]">
								{title}
							</h2>
						)}
						{description && <p className="text-[12px] text-muted-foreground leading-4">{description}</p>}
					</div>
					{actions}
				</header>
			)}
			<div className="p-4">{children}</div>
		</section>
	);
}

/**
 * Facts about one thing as label and value rows inside a sheet, like an inspector. Values
 * align to the trailing edge; identifiers should be passed already in mono.
 */
export function InfoList({
	items,
	className,
}: {
	items: Array<{ label: ReactNode; value: ReactNode }>;
	className?: string;
}) {
	return (
		<dl className={cn("group-sheet divide-y divide-border text-[13px]", className)}>
			{items.map((item, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and never reorder.
				<div key={index} className="flex min-h-10 items-center justify-between gap-4 px-4 py-2">
					<dt className="shrink-0 text-muted-foreground">{item.label}</dt>
					<dd className="min-w-0 truncate text-right">{item.value}</dd>
				</div>
			))}
		</dl>
	);
}

/** A metric value. Integers roll digit by digit; formatted values set their unit apart. */
export function Metric({
	value,
	format,
	className,
}: {
	value: number;
	format?: (n: number) => string;
	className?: string;
}) {
	return (
		<RollingValue
			text={format ? format(value) : value.toLocaleString("en-US")}
			{...(className ? { className } : {})}
		/>
	);
}

export function StatTile({
	label,
	value,
	format,
	hint,
	icon,
}: {
	label: string;
	value: number;
	format?: (n: number) => string;
	hint?: ReactNode;
	icon?: ReactNode;
}) {
	return (
		<div className="group-sheet px-4 py-3.5">
			<div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
				{icon && <span className="[&_svg]:size-3.5">{icon}</span>}
				<span className="truncate">{label}</span>
			</div>
			<div className="metric mt-1.5 font-semibold text-[28px] leading-8">
				<Metric value={value} {...(format ? { format } : {})} />
			</div>
			{hint && <div className="mt-0.5 truncate text-[12px] text-muted-foreground">{hint}</div>}
		</div>
	);
}

/** A row of metric widgets: the page's key numbers at a glance. */
export function StatBand({
	stats,
	className,
}: {
	stats: Array<{ label: string; value: number; format?: (n: number) => string; hint?: ReactNode }>;
	className?: string;
}) {
	return (
		<dl className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}>
			{stats.map((stat) => (
				<div key={stat.label} className="group-sheet flex flex-col-reverse justify-end px-4 py-3.5">
					<dt className="text-[13px] text-muted-foreground">
						{stat.label}
						{stat.hint && (
							<span className="mt-0.5 block truncate text-[12px] text-tertiary">{stat.hint}</span>
						)}
					</dt>
					<dd className="metric font-semibold text-[28px] leading-8">
						<Metric value={stat.value} {...(stat.format ? { format: stat.format } : {})} />
					</dd>
				</div>
			))}
		</dl>
	);
}

/** A featured sheet for the one visual a page is about (a chart, a map, a gauge). */
export function AuroraCard({ children, className }: { children: ReactNode; className?: string }) {
	return <div className={cn("group-sheet relative overflow-hidden", className)}>{children}</div>;
}

/** Used/total bar. Turns amber past 80% and red past 95%, always with a text value beside it. */
export function CapacityBar({ used, total, className }: { used: number; total: number; className?: string }) {
	const arriving = useArriving();
	const fraction = ratio(used, total);
	const tone = fraction >= 0.95 ? "bg-destructive" : fraction >= 0.8 ? "bg-warning" : "spectrum";
	return (
		// biome-ignore lint/a11y/useSemanticElements: a native <meter> cannot animate its fill.
		<div
			className={cn("h-1.5 w-full overflow-hidden rounded-full bg-accent", className)}
			role="meter"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={Math.round(fraction * 100)}
			aria-label={`${formatPercent(fraction)} used`}
		>
			<motion.div
				className={cn("h-full rounded-full", tone)}
				initial={arriving ? { width: 0 } : false}
				animate={{ width: `${fraction * 100}%` }}
				transition={{ duration: SPEED.data, ease: EASE }}
			/>
		</div>
	);
}

export function StatusDot({ tone, label }: { tone: "good" | "warn" | "bad" | "idle"; label: string }) {
	const color = {
		good: "bg-success",
		warn: "bg-warning",
		bad: "bg-destructive",
		idle: "bg-muted-foreground/40",
	}[tone];
	return (
		<span className="inline-flex items-center gap-1.5">
			<span className={cn("size-2 shrink-0 rounded-full", color)} />
			<span>{label}</span>
		</span>
	);
}

export function SkeletonBlock({ className }: { className?: string }) {
	return <Skeleton className={cn("tide", className)} />;
}

export function EmptyState({
	icon,
	title,
	description,
	action,
}: {
	icon: ReactNode;
	title: string;
	description: ReactNode;
	action?: ReactNode;
}) {
	return (
		<div className="group-sheet flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
			<span className="flex size-11 items-center justify-center rounded-full bg-raised text-muted-foreground [&_svg]:size-5">
				{icon}
			</span>
			<div>
				<p className="font-semibold text-[15px]">{title}</p>
				<p className="mt-0.5 max-w-sm text-[13px] text-muted-foreground">{description}</p>
			</div>
			{action}
		</div>
	);
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
	const upstream = error instanceof ApiError ? error.upstream : undefined;
	const message = error instanceof Error ? error.message : "Something went wrong";
	return (
		<div role="alert" className="group-sheet flex flex-col items-start gap-2 p-4">
			<div className="flex items-center gap-2 font-medium text-destructive">
				<AlertTriangle className="size-4" />
				{upstream ? `SeaweedFS ${upstream} reported a problem` : "Could not load this data"}
			</div>
			<p className="text-sm">{message}</p>
			{onRetry && (
				<Button variant="outline" size="sm" onClick={onRetry}>
					<RotateCw />
					Try again
				</Button>
			)}
		</div>
	);
}
