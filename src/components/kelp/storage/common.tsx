import type { ReactNode } from "react";
import { SkeletonBlock } from "@/components/kelp/page.tsx";
import { cn } from "@/lib/utils";

/** Placeholder for a page hero (signature card) and its stat band while the inventory loads. */
export function HeroSkeleton({ band = 4 }: { band?: number }) {
	return (
		<div role="status" aria-busy="true" aria-label="Loading storage">
			<SkeletonBlock className="h-64 rounded-2xl" />
			<div className="grid grid-cols-2 gap-8 py-10 sm:grid-cols-4">
				{Array.from({ length: band }, (_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders.
					<SkeletonBlock key={i} className="h-16" />
				))}
			</div>
		</div>
	);
}

/** A page's opening skeleton: title, lead, then the hero. */
export function PageSkeleton() {
	return (
		<div className="pt-8 sm:pt-12">
			<SkeletonBlock className="h-12 w-64" />
			<SkeletonBlock className="mt-4 mb-10 h-5 w-96 max-w-full" />
			<HeroSkeleton />
		</div>
	);
}

/** The stat band's frame: hairlines above and below, breathing room inside. */
export function Band({ children, className }: { children: ReactNode; className?: string }) {
	return <div className={cn("hairline-t hairline-b my-10 py-8", className)}>{children}</div>;
}

/** Labelled facts on the page itself, split by hairlines, label under value as on x.ai. */
export function Facts({ items }: { items: Array<[string, ReactNode]> }) {
	return (
		<dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-hairline sm:grid-cols-3 xl:grid-cols-6">
			{items.map(([label, value]) => (
				<div key={label} className="flex min-w-0 flex-col-reverse justify-end gap-1.5 bg-background p-5">
					<dt className="text-[13px] text-muted-foreground">{label}</dt>
					<dd className="min-w-0 text-[15px]">{value}</dd>
				</div>
			))}
		</dl>
	);
}

/** A section heading on the page (not in a card): 24px, with an optional line of context. */
export function SectionTitle({
	title,
	description,
	actions,
}: {
	title: string;
	description?: ReactNode;
	actions?: ReactNode;
}) {
	return (
		<div className="mb-5 flex flex-wrap items-end justify-between gap-3">
			<div>
				<h2 className="font-[450] text-2xl tracking-[-0.02em]">{title}</h2>
				{description && <p className="mt-1 text-[15px] text-muted-foreground">{description}</p>}
			</div>
			{actions}
		</div>
	);
}

/** Toggle-group items as quiet pills; the chosen one sits on a raised pill. */
export const PRESSED =
	"h-8 rounded-full border-0 px-3.5 font-normal text-[13px] text-foreground/60 hover:bg-transparent hover:text-foreground aria-pressed:bg-secondary aria-pressed:text-foreground";
