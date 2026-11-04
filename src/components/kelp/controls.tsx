import type { ReactNode } from "react";
import HoldButton from "@/components/react-bits/HoldButton.tsx";
import RubberSegment from "@/components/react-bits/RubberSegment.tsx";
import { cn } from "@/lib/utils";

/**
 * Kelp's segmented control (DESIGN.md): a raised track with a thumb that springs between
 * segments. Use it for filters and view switches; each segment is a radio for assistive tech.
 */
export function Segmented<T extends string>({
	items,
	value,
	onChange,
	label,
	size = "sm",
	className,
}: {
	items: Array<{ value: T; label: ReactNode }>;
	value: T;
	onChange: (value: T) => void;
	/** Names the control for screen readers, e.g. "Filter volumes". */
	label: string;
	size?: "sm" | "md";
	className?: string;
}) {
	return (
		// Segments size to their labels; on narrow screens the control scrolls instead of squeezing.
		<div className={cn("-mx-1 max-w-full overflow-x-auto px-1 [scrollbar-width:none]", className)}>
			<RubberSegment
				items={items}
				value={value}
				onChange={(next) => onChange(next as T)}
				aria-label={label}
				size={size}
				radius={8}
				inset={2}
				trackColor="var(--secondary)"
				thumbColor="var(--thumb)"
				textColor="var(--foreground)"
				activeTextColor="var(--foreground)"
				equalSlots={false}
				className="shadow-none [&_[aria-hidden=true]]:shadow-[0_1px_3px_rgb(0_0_0/0.12)]"
			/>
		</div>
	);
}

/**
 * Hold to delete: for removing something that holds data. The fill rises while pressed and
 * the action runs only when it completes, so a stray click never loses anything.
 */
export function HoldToDelete({
	children,
	onConfirm,
	disabled,
	className,
}: {
	children: ReactNode;
	onConfirm: () => void;
	disabled?: boolean;
	className?: string;
}) {
	return (
		<HoldButton
			size="sm"
			radius={8}
			holdTime={900}
			backgroundColor="color-mix(in oklab, var(--destructive) 12%, transparent)"
			fillColor="var(--destructive)"
			textColor="var(--destructive)"
			fillTextColor="#ffffff"
			doneLabel="Deleting"
			onHold={onConfirm}
			{...(disabled ? { disabled } : {})}
			className={cn("h-8 px-3", className)}
		>
			{children}
		</HoldButton>
	);
}
