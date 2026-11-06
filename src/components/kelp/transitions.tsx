import { AnimatePresence, type HTMLMotionProps, motion, useIsPresent } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ARRIVAL_MS, ArrivalContext, EASE, SPEED, usePrefersReducedMotion } from "./motion.ts";
import { ErrorState } from "./page.tsx";

/**
 * Content rises a few pixels as it fades in. Only opacity and transform move, so the compositor runs
 * it: a blur over a whole page would repaint every chart and row on every frame. The transform is
 * cleared afterwards, because a lasting one would trap fixed and sticky children.
 */
const SHARPEN = {
	from: { opacity: 0, y: 6 },
	to: { opacity: 1, y: 0, transitionEnd: { transform: "none" } },
};

/**
 * One view in a crossfade. A view on its way out is hidden from assistive tech and can't be
 * focused or clicked, so during the fade only the arriving view exists for screen readers and tests.
 */
function Layer(props: HTMLMotionProps<"div">) {
	const leaving = !useIsPresent();
	return <motion.div {...props} {...(leaving ? { "aria-hidden": true, inert: true } : {})} />;
}

/**
 * Marks content that just replaced its skeleton, for the length of its entrance: charts inside grow
 * and rows rise. Content that was already cached never arrives, so revisits and tab switches are still.
 */
function Arrival({ arriving, children }: { arriving: boolean; children: ReactNode }) {
	const [on, setOn] = useState(arriving);
	useEffect(() => {
		if (!on) return;
		const timer = setTimeout(() => setOn(false), ARRIVAL_MS);
		return () => clearTimeout(timer);
	}, [on]);
	return (
		<ArrivalContext.Provider value={on}>
			<div data-arrived={on ? "" : undefined} className="contents">
				{children}
			</div>
		</ArrivalContext.Provider>
	);
}

interface QueryLike<T> {
	data: T | undefined;
	error: unknown;
	refetch?: () => unknown;
}

/** Waits on several queries as one: data once all have it, the first error otherwise. */
export function allOf<T extends Record<string, QueryLike<unknown>>>(
	queries: T,
): QueryLike<{ [K in keyof T]: NonNullable<T[K]["data"]> }> {
	const list = Object.values(queries);
	const ready = list.every((q) => q.data !== undefined);
	return {
		data: ready
			? (Object.fromEntries(Object.entries(queries).map(([k, q]) => [k, q.data])) as {
					[K in keyof T]: NonNullable<T[K]["data"]>;
				})
			: undefined,
		error: list.find((q) => q.data === undefined && q.error)?.error ?? null,
		refetch: () => {
			for (const q of list) q.refetch?.();
		},
	};
}

/** Pages whose content someone has already seen this session. */
const seen = new Set<string>();

/**
 * The three states of anything that loads, as one crossfade: a layout-matched skeleton, then the
 * content sharpening into place in the same grid cell, so nothing jumps. The first time a page's
 * content appears it makes an entrance, even when hovering its link already fetched the data;
 * after that it is simply there. A failed background refresh keeps the data on screen.
 */
export function Loaded<T>({
	query,
	skeleton,
	children,
	className,
}: {
	query: QueryLike<T>;
	skeleton: ReactNode;
	children: (data: T) => ReactNode;
	className?: string;
}) {
	const reduced = usePrefersReducedMotion();
	const state = query.data !== undefined ? "data" : query.error ? "error" : "pending";
	const refetch = query.refetch;
	const page = window.location.pathname;
	// Content arrives when it replaces a skeleton or an error, or shows here for the first time.
	const [firstSight] = useState(() => state === "data" && !seen.has(page));
	const last = useRef<string | null>(null);
	const arriving = state === "data" && (last.current === null ? firstSight : last.current !== "data");
	useEffect(() => {
		last.current = state;
		if (state === "data") seen.add(page);
	});
	return (
		<div className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)] *:col-start-1 *:row-start-1", className)}>
			<AnimatePresence initial={firstSight}>
				{state === "pending" && (
					<Layer
						key="skeleton"
						aria-busy="true"
						// The CSS delay spares a fast answer from flashing a skeleton at all.
						className="kelp-skeleton-in pointer-events-none min-w-0"
						initial={false}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0, transition: { duration: reduced ? 0 : SPEED.base, ease: "easeOut" } }}
					>
						{skeleton}
					</Layer>
				)}
				{state === "error" && (
					<Layer
						key="error"
						className="min-w-0"
						initial={reduced ? false : { opacity: 0, y: 6 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0 }}
						transition={{ duration: SPEED.base, ease: EASE }}
					>
						<ErrorState error={query.error} {...(refetch ? { onRetry: () => refetch() } : {})} />
					</Layer>
				)}
				{state === "data" && (
					<Layer
						key="data"
						className="min-w-0"
						// Skipped (AnimatePresence `initial`) for content already seen on an earlier visit.
						initial={reduced ? false : SHARPEN.from}
						animate={SHARPEN.to}
						exit={{ opacity: 0, transition: { duration: SPEED.fast } }}
						transition={{ duration: SPEED.slow, ease: EASE }}
					>
						<Arrival arriving={arriving}>{children(query.data as T)}</Arrival>
					</Layer>
				)}
			</AnimatePresence>
		</div>
	);
}

/**
 * Crossfades whatever `id` names: a tab's content, a mode, an empty state turning into a list. The
 * old and new views share a grid cell during the swap, so the page below them holds still.
 */
export function Swap({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
	const reduced = usePrefersReducedMotion();
	return (
		<div className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)] *:col-start-1 *:row-start-1", className)}>
			<AnimatePresence initial={false}>
				<Layer
					key={id}
					className="min-w-0"
					initial={reduced ? false : SHARPEN.from}
					animate={SHARPEN.to}
					exit={{ opacity: 0, transition: { duration: reduced ? 0 : SPEED.fast } }}
					transition={{ duration: SPEED.base, ease: EASE }}
				>
					{children}
				</Layer>
			</AnimatePresence>
		</div>
	);
}
