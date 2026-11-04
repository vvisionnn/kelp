import { cn } from "@/lib/utils";

/** Three kelp fronds rising from a holdfast. */
export function KelpMark({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={cn("size-6", className)}>
			<path
				d="M9 29c0-6 3-8 2-13s-3-7-1-12"
				stroke="currentColor"
				strokeWidth="2.4"
				strokeLinecap="round"
				opacity="0.55"
			/>
			<path d="M16 29c0-8-3-10-2-16s4-7 3-11" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
			<path
				d="M23 29c0-5 2-7 1-11s-2-5 0-9"
				stroke="currentColor"
				strokeWidth="2.4"
				strokeLinecap="round"
				opacity="0.75"
			/>
			<ellipse cx="13.6" cy="12.5" rx="2.4" ry="1.2" transform="rotate(-35 13.6 12.5)" fill="currentColor" />
			<ellipse
				cx="24.4"
				cy="15.5"
				rx="2"
				ry="1"
				transform="rotate(30 24.4 15.5)"
				fill="currentColor"
				opacity="0.75"
			/>
		</svg>
	);
}

export function Wordmark({ className }: { className?: string }) {
	return (
		<span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
			<KelpMark />
			<span>Kelp</span>
		</span>
	);
}
