import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav.ts";

const SIZES = {
	sm: "size-5 rounded-[5px] [&_svg]:size-3",
	md: "size-7 rounded-[7px] [&_svg]:size-4",
	lg: "size-9 rounded-[9px] [&_svg]:size-5",
} as const;

/** A page's identity tile: its color and glyph, like a System Settings icon (DESIGN.md). */
export function Tile({
	item,
	size = "sm",
	className,
}: {
	item: Pick<NavItem, "icon" | "tile">;
	size?: keyof typeof SIZES;
	className?: string;
}) {
	return (
		<span
			aria-hidden="true"
			className={cn("tile", SIZES[size], className)}
			style={{ "--tile": item.tile } as CSSProperties}
		>
			<item.icon strokeWidth={2.2} />
		</span>
	);
}
