import { cn } from "@/lib/utils";

const SIZES = {
	sm: "size-7 text-xs",
	md: "size-9 text-sm",
	lg: "size-16 text-2xl sm:size-20 sm:text-3xl",
} as const;

/** A person's initial on the sunset gradient: users and members read as people, not rows. */
export function Avatar({
	name,
	size = "sm",
	className,
}: {
	name: string;
	size?: keyof typeof SIZES;
	className?: string;
}) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"flex shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--area-glow),var(--area-core)_55%,var(--area-deep))] font-medium text-white uppercase",
				SIZES[size],
				className,
			)}
		>
			{name.slice(0, 1)}
		</span>
	);
}

/** Overlapping avatars for a group's members, collapsing past `max` into a count. */
export function AvatarStack({
	names,
	max = 5,
	size = "sm",
}: {
	names: string[];
	max?: number;
	size?: "sm" | "md";
}) {
	const shown = names.slice(0, max);
	return (
		<span className="flex items-center">
			{shown.map((name) => (
				<Avatar key={name} name={name} size={size} className="-ml-2 ring-2 ring-card first:ml-0" />
			))}
			{names.length > max && (
				<span
					className={cn(
						"-ml-2 flex items-center justify-center rounded-full bg-secondary text-[11px] ring-2 ring-card tabular",
						SIZES[size],
					)}
				>
					+{names.length - max}
				</span>
			)}
		</span>
	);
}
