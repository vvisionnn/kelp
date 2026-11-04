import type { Bucket } from "@shared/objects.ts";
import { History, Lock, ScrollText, ShieldCheck, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function Flag({ icon, label, hint, tone }: { icon: ReactNode; label: string; hint: string; tone?: "warn" }) {
	return (
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
	);
}

/** Compact badges for the settings that change how a bucket behaves. */
export function BucketFlags({ bucket }: { bucket: Bucket }) {
	return (
		<span className="flex flex-wrap items-center gap-1.5">
			{bucket.readOnly && (
				<Flag
					icon={<TriangleAlert />}
					label="Read-only"
					hint="SeaweedFS blocks writes, usually because the bucket is over its quota."
					tone="warn"
				/>
			)}
			{bucket.versioning !== "Off" && (
				<Flag
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
					icon={<ScrollText />}
					label="Lifecycle"
					hint={`${bucket.lifecycle.enabled} of ${bucket.lifecycle.rules} lifecycle rules active.`}
				/>
			)}
			{bucket.policyStatements > 0 && (
				<Flag
					icon={<ShieldCheck />}
					label="Policy"
					hint={`A bucket policy with ${bucket.policyStatements} ${bucket.policyStatements === 1 ? "statement" : "statements"}.`}
				/>
			)}
		</span>
	);
}
