import { AlertTriangle, RotateCw } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import CountUp from "@/components/react-bits/CountUp.tsx";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api.ts";
import { formatPercent, ratio } from "@/lib/format.ts";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "./motion.ts";

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
		<div className="flex flex-wrap items-end justify-between gap-4 pt-2 pb-6">
			<div className="min-w-0">
				<h1 className="font-semibold text-2xl tracking-tight [font-stretch:92%]">{title}</h1>
				{description && <div className="mt-1 max-w-prose text-muted-foreground text-sm">{description}</div>}
			</div>
			{actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
		</div>
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
			transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay }}
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
	return (
		<section className={cn("rounded-xl border bg-card text-card-foreground", className)}>
			{(title || actions) && (
				<header className="flex items-start justify-between gap-3 px-5 pt-4">
					<div>
						{title && <h2 className="font-medium text-sm">{title}</h2>}
						{description && <p className="mt-0.5 text-muted-foreground text-xs">{description}</p>}
					</div>
					{actions}
				</header>
			)}
			<div className="p-5">{children}</div>
		</section>
	);
}

/** A number that counts up on first load and then just updates. */
export function Metric({
	value,
	format,
	className,
}: {
	value: number;
	format?: (n: number) => string;
	className?: string;
}) {
	const reduced = usePrefersReducedMotion();
	if (format || reduced)
		return (
			<span className={cn("tabular", className)}>
				{format ? format(value) : value.toLocaleString("en-US")}
			</span>
		);
	return <CountUp to={value} duration={0.9} separator="," className={cn("tabular", className)} />;
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
		<div className="rounded-xl border bg-card px-5 py-4">
			<div className="flex items-center justify-between text-muted-foreground text-sm">
				<span>{label}</span>
				<span className="[&_svg]:size-4">{icon}</span>
			</div>
			<div className="mt-2 font-semibold text-2xl tracking-tight [font-stretch:90%]">
				<Metric value={value} {...(format ? { format } : {})} />
			</div>
			{hint && <div className="mt-1 text-muted-foreground text-xs">{hint}</div>}
		</div>
	);
}

/** Used/total bar. Turns amber past 80% and red past 95%, always with a text value beside it. */
export function CapacityBar({ used, total, className }: { used: number; total: number; className?: string }) {
	const fraction = ratio(used, total);
	const tone = fraction >= 0.95 ? "bg-destructive" : fraction >= 0.8 ? "bg-warning" : "bg-primary";
	return (
		// biome-ignore lint/a11y/useSemanticElements: a native <meter> cannot animate its fill.
		<div
			className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
			role="meter"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={Math.round(fraction * 100)}
			aria-label={`${formatPercent(fraction)} used`}
		>
			<motion.div
				className={cn("h-full rounded-full", tone)}
				initial={{ width: 0 }}
				animate={{ width: `${fraction * 100}%` }}
				transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
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
			<span className={cn("relative flex size-2 rounded-full", color)}>
				{tone === "good" && (
					<span className={cn("absolute inset-0 animate-ping rounded-full opacity-40", color)} />
				)}
			</span>
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
		<div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center">
			<span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5">
				{icon}
			</span>
			<div>
				<p className="font-medium">{title}</p>
				<p className="mt-1 max-w-sm text-muted-foreground text-sm">{description}</p>
			</div>
			{action}
		</div>
	);
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
	const upstream = error instanceof ApiError ? error.upstream : undefined;
	const message = error instanceof Error ? error.message : "Something went wrong";
	return (
		<div
			role="alert"
			className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5"
		>
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
