import type { Bucket } from "@shared/objects.ts";
import { History, Lock, ScrollText, ShieldCheck, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { EASE, SPEED, usePrefersReducedMotion } from "@/components/kelp/motion.ts";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function Flag({ icon, label, hint, tone }: { icon: ReactNode; label: string; hint: string; tone?: "warn" }) {
	const reduced = usePrefersReducedMotion();
	return (
		<motion.span
			className="inline-flex"
			initial={reduced ? false : { opacity: 0, scale: 0.92 }}
			animate={{ opacity: 1, scale: 1 }}
			exit={{ opacity: 0, transition: { duration: reduced ? 0 : SPEED.fast } }}
			transition={{ duration: SPEED.base, ease: EASE }}
		>
			<Tooltip>
				<TooltipTrigger
					render={
						<Badge
							variant="secondary"
							className={tone === "warn" ? "bg-warning/12 text-warning-foreground" : "text-foreground/75"}
						/>
					}
				>
					{icon}
					{label}
				</TooltipTrigger>
				<TooltipContent>{hint}</TooltipContent>
			</Tooltip>
		</motion.span>
	);
}

/** Compact badges for the settings that change how a bucket behaves. */
export function BucketFlags({ bucket }: { bucket: Bucket }) {
	return (
		<span className="flex flex-wrap items-center gap-1.5">
			<AnimatePresence initial={false}>
				{bucket.readOnly && (
					<Flag
						key="read-only"
						icon={<TriangleAlert />}
						label="Read-only"
						hint="SeaweedFS blocks writes, usually because the bucket is over its quota."
						tone="warn"
					/>
				)}
				{bucket.versioning !== "Off" && (
					<Flag
						key="versioning"
						icon={<History />}
						label={bucket.versioning === "Suspended" ? "Versioning paused" : "Versioned"}
						hint={
							bucket.versioning === "Suspended"
								? "Existing versions are kept; new writes replace the current version."
								: "Overwrites and deletes keep previous versions."
						}
					/>
				)}
				{bucket.objectLock.enabled && (
					<Flag
						key="lock"
						icon={<Lock />}
						label={bucket.objectLock.mode === "COMPLIANCE" ? "Compliance lock" : "Object lock"}
						hint={
							bucket.objectLock.retentionDays
								? `New objects are protected for ${bucket.objectLock.retentionDays} days.`
								: "Objects can be protected from deletion."
						}
					/>
				)}
				{bucket.lifecycle.enabled > 0 && (
					<Flag
						key="lifecycle"
						icon={<ScrollText />}
						label="Lifecycle"
						hint={`${bucket.lifecycle.enabled} of ${bucket.lifecycle.rules} lifecycle rules active.`}
					/>
				)}
				{bucket.policyStatements > 0 && (
					<Flag
						key="policy"
						icon={<ShieldCheck />}
						label="Policy"
						hint={`A bucket policy with ${bucket.policyStatements} ${bucket.policyStatements === 1 ? "statement" : "statements"}.`}
					/>
				)}
			</AnimatePresence>
		</span>
	);
}
