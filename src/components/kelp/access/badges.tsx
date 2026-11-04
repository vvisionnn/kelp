import type { KeyStatus } from "@shared/iam.ts";
import { FileLock2 } from "lucide-react";
import { Badge } from "@/components/reui/badge";

export function KeyStatusBadge({ status }: { status: KeyStatus }) {
	return status === "Active" ? (
		<Badge variant="success-light" radius="full" className="px-2">
			Active
		</Badge>
	) : (
		<Badge variant="outline" radius="full" className="px-2 text-muted-foreground">
			Inactive
		</Badge>
	);
}

/** Marks users defined in the S3 config file, which SeaweedFS does not let anyone edit. */
export function StaticBadge() {
	return (
		<Badge variant="info-light" radius="full" className="px-2" title="Defined in the S3 config file">
			<FileLock2 />
			Config file
		</Badge>
	);
}

/** A compact list of names that collapses to "+N" past `max`. */
export function NameList({
	names,
	max = 3,
	empty = "None",
}: {
	names: string[];
	max?: number;
	empty?: string;
}) {
	if (names.length === 0) return <span className="text-muted-foreground">{empty}</span>;
	const shown = names.slice(0, max);
	return (
		<span className="flex flex-wrap items-center gap-1">
			{shown.map((name) => (
				<Badge key={name} variant="secondary" radius="full" className="px-2">
					{name}
				</Badge>
			))}
			{names.length > max && <span className="text-muted-foreground text-xs">+{names.length - max}</span>}
		</span>
	);
}
