import type { ReactNode } from "react";
import { SkeletonBlock } from "@/components/kelp/page.tsx";

/** Placeholder for a row of stat tiles while the inventory loads. */
export function TilesSkeleton({ count = 4 }: { count?: number }) {
	return (
		<div
			className="grid grid-cols-2 gap-4 lg:grid-cols-4"
			role="status"
			aria-busy="true"
			aria-label="Loading storage"
		>
			{Array.from({ length: count }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders.
				<SkeletonBlock key={i} className="h-[104px] rounded-xl" />
			))}
		</div>
	);
}

export function Tiles({ children }: { children: ReactNode }) {
	return <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{children}</div>;
}

/** A strip of labelled facts, label above value. */
export function Facts({ items }: { items: Array<[string, ReactNode]> }) {
	return (
		<dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-3 xl:grid-cols-6">
			{items.map(([label, value]) => (
				<div key={label} className="min-w-0">
					<dt className="text-muted-foreground text-xs">{label}</dt>
					<dd className="mt-1">{value}</dd>
				</div>
			))}
		</dl>
	);
}

/** Makes the chosen option of a toggle group unmistakable in both themes. */
export const PRESSED = "aria-pressed:border-primary/40 aria-pressed:bg-primary/12 aria-pressed:text-primary";

/** Header with a sort button, for columns worth ordering by. */
