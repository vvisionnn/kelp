import type { ReactNode } from "react";
import { SkeletonBlock } from "@/components/kelp/page.tsx";

/** Placeholder for a page's featured sheet and widget row while the inventory loads. */
export function HeroSkeleton({ band = 4 }: { band?: number }) {
	return (
		<div role="status" aria-busy="true" aria-label="Loading storage">
			<SkeletonBlock className="h-44 rounded-xl" />
			<div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
				{Array.from({ length: band }, (_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders.
					<SkeletonBlock key={i} className="h-[88px] rounded-xl" />
				))}
			</div>
		</div>
	);
}

/** A detail page's opening skeleton: header, then the main and side columns. */
export function PageSkeleton() {
	return (
		<div role="status" aria-busy="true" aria-label="Loading">
			<div className="flex items-center gap-3 pt-2 pb-6">
				<SkeletonBlock className="size-9 rounded-[9px]" />
				<div className="space-y-1.5">
					<SkeletonBlock className="h-7 w-48" />
					<SkeletonBlock className="h-4 w-80 max-w-full" />
				</div>
			</div>
			<div className="grid gap-6 lg:grid-cols-12">
				<SkeletonBlock className="h-56 rounded-xl lg:col-span-8" />
				<SkeletonBlock className="h-56 rounded-xl lg:col-span-4" />
			</div>
		</div>
	);
}

/** A featured sheet's caption row: what it shows on the left, how to read it on the right. */
export function SheetCaption({ title, children }: { title: ReactNode; children?: ReactNode }) {
	return (
		<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
			<h2 className="font-semibold text-[13px]">{title}</h2>
			{children && <p className="text-[12px] text-muted-foreground">{children}</p>}
		</div>
	);
}
