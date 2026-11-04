import { Check, Copy } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Copies `value` and confirms with a quick check-mark swap. */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
	const [copied, setCopied] = useState(false);
	async function copy() {
		await navigator.clipboard.writeText(value);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}
	return (
		<Button
			type="button"
			variant="ghost"
			size="icon-xs"
			aria-label={copied ? "Copied" : label}
			onClick={copy}
		>
			<AnimatePresence mode="wait" initial={false}>
				<motion.span
					key={copied ? "done" : "copy"}
					initial={{ scale: 0.6, opacity: 0 }}
					animate={{ scale: 1, opacity: 1 }}
					exit={{ scale: 0.6, opacity: 0 }}
					transition={{ duration: 0.15 }}
					className="flex"
				>
					{copied ? <Check className="text-success" /> : <Copy />}
				</motion.span>
			</AnimatePresence>
		</Button>
	);
}
