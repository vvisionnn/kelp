import { cn } from "@/lib/utils";

const SIZES = {
	sm: "size-6 text-[11px]",
	md: "size-7 text-[12px]",
	lg: "size-9 text-[15px]",
} as const;

/** A person's initial on a neutral grey disc, like Contacts: users and members read as people. */
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
				"flex shrink-0 items-center justify-center rounded-full bg-[linear-gradient(180deg,#a1a1a6,#6e6e73)] font-semibold text-white uppercase dark:bg-[linear-gradient(180deg,#8e8e93,#545458)]",
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
				<Avatar key={name} name={name} size={size} className="-ml-1.5 ring-2 ring-card first:ml-0" />
			))}
			{names.length > max && (
				<span
					className={cn(
						"-ml-1.5 flex items-center justify-center rounded-full bg-raised text-[11px] text-muted-foreground ring-2 ring-card tabular",
						SIZES[size],
					)}
				>
					+{names.length - max}
				</span>
			)}
		</span>
	);
}
