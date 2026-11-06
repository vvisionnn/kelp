import type { TopicRetention } from "@shared/messaging.ts";
import { useId } from "react";
import { Collapse } from "@/components/kelp/maintenance/parts.tsx";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export const RETENTION_UNITS = [
	{ unit: "hours", seconds: 3600 },
	{ unit: "days", seconds: 86_400 },
	{ unit: "weeks", seconds: 604_800 },
] as const;
export type RetentionUnit = (typeof RETENTION_UNITS)[number]["unit"];

const PLAIN_UNITS: Array<[string, number]> = [
	["week", 604_800],
	["day", 86_400],
	["hour", 3600],
	["minute", 60],
	["second", 1],
];

/** "Keep forever", "7 days", "36 hours"… the largest unit that divides the window evenly. */
export function formatRetention(retention: TopicRetention): string {
	if (!retention.enabled || retention.seconds <= 0) return "Keep forever";
	const [name, size] = PLAIN_UNITS.find(([, size]) => retention.seconds % size === 0) ?? ["second", 1];
	const count = retention.seconds / size;
	return `${count} ${name}${count === 1 ? "" : "s"}`;
}

/** Splits seconds into the form's value + unit, defaulting to 7 days. */
export function splitRetention(seconds: number): { value: number; unit: RetentionUnit } {
	if (seconds <= 0) return { value: 7, unit: "days" };
	const unit = [...RETENTION_UNITS].reverse().find((u) => seconds % u.seconds === 0);
	if (unit) return { value: seconds / unit.seconds, unit: unit.unit };
	return { value: Math.max(1, Math.round(seconds / 3600)), unit: "hours" };
}

export function retentionSeconds(value: number, unit: RetentionUnit): number {
	return value * (RETENTION_UNITS.find((u) => u.unit === unit)?.seconds ?? 86_400);
}

export interface RetentionDraft {
	enabled: boolean;
	value: number;
	unit: RetentionUnit;
}

export function draftFrom(retention: TopicRetention): RetentionDraft {
	return { enabled: retention.enabled, ...splitRetention(retention.seconds) };
}

export function retentionFrom(draft: RetentionDraft): TopicRetention {
	return draft.enabled
		? { enabled: true, seconds: retentionSeconds(draft.value, draft.unit) }
		: { enabled: false, seconds: 0 };
}

/** Retention controls: a switch, then how long to keep messages. */
export function RetentionFields({
	draft,
	onChange,
	disabled,
}: {
	draft: RetentionDraft;
	onChange: (draft: RetentionDraft) => void;
	disabled?: boolean;
}) {
	const id = useId();
	return (
		<div className="grid gap-3">
			<div className="flex items-center justify-between gap-4 text-[13px]">
				<label htmlFor={id}>
					<span>Expire old messages</span>
					<span className="block text-[12px] text-muted-foreground">
						{draft.enabled
							? "SeaweedFS deletes data older than the window."
							: "Messages are kept until you delete the topic."}
					</span>
				</label>
				<Switch
					id={id}
					checked={draft.enabled}
					disabled={disabled}
					onCheckedChange={(enabled) => onChange({ ...draft, enabled })}
				/>
			</div>
			<Collapse open={draft.enabled}>
				<div className="flex flex-wrap items-center gap-2">
					<Input
						type="number"
						min={1}
						aria-label="Keep messages for"
						className="w-24 tabular"
						value={draft.value}
						disabled={disabled}
						onChange={(event) =>
							onChange({ ...draft, value: Math.max(1, Math.floor(Number(event.target.value) || 1)) })
						}
					/>
					<ToggleGroup
						variant="outline"
						size="sm"
						spacing={0}
						aria-label="Retention unit"
						value={[draft.unit]}
						disabled={disabled}
						onValueChange={(value) => {
							const unit = value[0] as RetentionUnit | undefined;
							if (unit) onChange({ ...draft, unit });
						}}
					>
						{RETENTION_UNITS.map((u) => (
							<ToggleGroupItem
								key={u.unit}
								value={u.unit}
								className="capitalize aria-pressed:bg-primary/12 aria-pressed:text-primary"
							>
								{u.unit}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
				</div>
			</Collapse>
		</div>
	);
}
