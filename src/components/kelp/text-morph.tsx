import { AnimatePresence, motion } from "motion/react";
import { memo, useMemo } from "react";
import Counter from "@/components/react-bits/Counter.tsx";
import { cn } from "@/lib/utils";
import { EASE, SPEED, useArriving, usePrefersReducedMotion, useWatching } from "./motion.ts";

/** Text longer than this stops morphing by letter; it would only read as noise. */
const LETTER_LIMIT = 32;

function pieces(text: string, by: "letter" | "word") {
	const parts = by === "letter" ? [...text] : text.split(/(\s+)/).filter(Boolean);
	const seen = new Map<string, number>();
	return parts.map((part) => {
		const count = seen.get(part) ?? 0;
		seen.set(part, count + 1);
		return { key: `${part}:${count}`, part };
	});
}

/**
 * Text that morphs when it changes: letters both versions share glide to their new place, the rest
 * fade and drift in and out. For short, single-line strings such as titles, statuses and button
 * labels. Memoized: every glyph tracks its layout, so a parent re-rendering with the same text must
 * not make each of them measure itself again.
 */
export const TextMorph = memo(function TextMorph({
	children,
	className,
}: {
	children: string;
	className?: string;
}) {
	const reduced = usePrefersReducedMotion();
	// While the view catches up, new text simply replaces the old.
	const watching = useWatching();
	const duration = watching() ? SPEED.base : 0;
	const glyphs = useMemo(
		() => pieces(children, children.length > LETTER_LIMIT ? "word" : "letter"),
		[children],
	);
	if (reduced) return <span className={className}>{children}</span>;
	return (
		<span className={cn("relative", className)}>
			<span className="sr-only">{children}</span>
			{/* Glyphs paint from an attribute, so the string exists once for search and for tests. */}
			<span aria-hidden="true" className="whitespace-pre">
				<AnimatePresence mode="popLayout" initial={false}>
					{glyphs.map((glyph) => (
						<motion.span
							key={glyph.key}
							data-glyph={glyph.part}
							className="inline-block before:content-[attr(data-glyph)]"
							layout="position"
							initial={{ opacity: 0, y: 3 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -3 }}
							transition={{ duration, ease: EASE }}
						/>
					))}
				</AnimatePresence>
			</span>
		</span>
	);
});

const NUMBER = /^([-−]?)([\d,]*\.?\d+)\s*(.*)$/;

/**
 * A formatted value ("6.73 MiB", "1,204", "Ready"): the number rolls digit by digit and its unit
 * sits lighter beside it; anything else morphs as text. Later changes always roll.
 */
export const RollingValue = memo(function RollingValue({
	text,
	className,
}: {
	text: string;
	className?: string;
}) {
	const reduced = usePrefersReducedMotion();
	// Digits spin in only when the number first arrives; on a revisit it is simply there, and a
	// refresh that lands while the view catches up settles in a blink instead of rolling.
	const arriving = useArriving();
	const watching = useWatching();
	const quiet = !watching();
	const match = NUMBER.exec(text);
	if (!match) return <TextMorph className={cn("tabular", className)}>{text}</TextMorph>;
	const [, sign, number, unit] = match as unknown as [string, string, string, string];
	const value = Number(`${sign ? "-" : ""}${number.replaceAll(",", "")}`);
	const decimals = number.split(".")[1]?.length ?? 0;
	return (
		<span className={cn("tabular", className)}>
			{reduced ? (
				`${sign}${number}`
			) : (
				<Counter
					value={value}
					locale="en-US"
					format={{
						useGrouping: number.includes(","),
						minimumFractionDigits: decimals,
						maximumFractionDigits: decimals,
					}}
					fontSize="1em"
					fontWeight="inherit"
					textColor="currentColor"
					tabular
					motionBlur={false}
					intro={arriving}
					duration={quiet ? 0.05 : 0.7}
					stagger={quiet ? 0 : 0.04}
				/>
			)}
			{unit && (
				<span className="ml-1 font-medium text-[0.6em] text-muted-foreground">
					<TextMorph>{unit}</TextMorph>
				</span>
			)}
		</span>
	);
});
