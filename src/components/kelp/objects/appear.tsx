import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { EASE, SPEED, usePrefersReducedMotion } from "@/components/kelp/motion.ts";
import { cn } from "@/lib/utils";

/**
 * A block that comes and goes with what a person is doing: it opens to its height and fades, so
 * the content below moves instead of jumping. `inline` only fades, for items in a row. The block
 * reaches slightly past its box so focus rings inside are not clipped.
 */
export function Appear({
	show,
	inline = false,
	className,
	children,
}: {
	show: boolean;
	inline?: boolean;
	className?: string;
	children: ReactNode;
}) {
	const reduced = usePrefersReducedMotion();
	const hidden = inline ? { opacity: 0 } : { height: 0, opacity: 0 };
	const shown = inline ? { opacity: 1 } : { height: "auto", opacity: 1 };
	return (
		<AnimatePresence initial={false}>
			{show && (
				<motion.div
					initial={reduced ? false : hidden}
					animate={shown}
					exit={reduced ? { opacity: 0, transition: { duration: 0 } } : hidden}
					transition={{ duration: SPEED.fast, ease: EASE }}
					className={cn(!inline && "-m-1 overflow-hidden p-1", className)}
				>
					{children}
				</motion.div>
			)}
		</AnimatePresence>
	);
}
