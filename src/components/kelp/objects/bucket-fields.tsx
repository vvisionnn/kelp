import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Appear } from "./appear.tsx";

/** Why `name` is not a valid S3 bucket name, or null when it is. Mirrors the server's rules. */
export function bucketNameProblem(name: string): string | null {
	if (name.length < 3 || name.length > 63) return "Use 3 to 63 characters";
	if (!/^[a-z0-9.-]+$/.test(name)) return "Use lowercase letters, numbers, dots and hyphens";
	if (!/^[a-z0-9].*[a-z0-9]$/.test(name)) return "Start and end with a letter or number";
	if (name.includes("..")) return "Avoid two dots in a row";
	if (/^\d+\.\d+\.\d+\.\d+$/.test(name)) return "Bucket names cannot look like an IP address";
	return null;
}

export const QUOTA_UNITS = { MiB: 1024 ** 2, GiB: 1024 ** 3, TiB: 1024 ** 4 } as const;
export type QuotaUnit = keyof typeof QUOTA_UNITS;

export interface QuotaValue {
	enabled: boolean;
	size: number;
	unit: QuotaUnit;
}

/** Splits a byte count into the largest unit that keeps a whole number. */
export function quotaFromBytes(bytes: number, enabled = bytes > 0): QuotaValue {
	if (bytes <= 0) return { enabled, size: 10, unit: "GiB" };
	for (const unit of ["TiB", "GiB", "MiB"] as const) {
		if (bytes % QUOTA_UNITS[unit] === 0) return { enabled, size: bytes / QUOTA_UNITS[unit], unit };
	}
	return { enabled, size: Math.max(1, Math.round(bytes / QUOTA_UNITS.MiB)), unit: "MiB" };
}

export function quotaBytes(value: QuotaValue): number {
	return Math.round(value.size * QUOTA_UNITS[value.unit]);
}

/** A quota switch with a size and unit, as one control. */
export function QuotaInput({
	value,
	onChange,
	disabled,
}: {
	value: QuotaValue;
	onChange: (value: QuotaValue) => void;
	disabled?: boolean;
}) {
	const id = useId();
	return (
		<div className="grid gap-3">
			<div className="flex items-center justify-between gap-4">
				<label htmlFor={`${id}-switch`} className="grid gap-0.5">
					<span className="font-medium text-sm">Limit storage</span>
					<span className="text-muted-foreground text-xs">
						Writes fail once the bucket reaches its quota.
					</span>
				</label>
				<Switch
					id={`${id}-switch`}
					checked={value.enabled}
					disabled={disabled}
					onCheckedChange={(enabled) => onChange({ ...value, enabled })}
				/>
			</div>
			<Appear show={value.enabled}>
				<div className="flex gap-2">
					<Input
						aria-label="Quota size"
						type="number"
						min={1}
						step="any"
						inputMode="decimal"
						className="tabular"
						disabled={disabled}
						value={Number.isFinite(value.size) ? value.size : ""}
						onChange={(event) => onChange({ ...value, size: event.target.valueAsNumber })}
					/>
					<Select
						value={value.unit}
						disabled={disabled}
						onValueChange={(unit) => onChange({ ...value, unit: unit as QuotaUnit })}
					>
						<SelectTrigger aria-label="Quota unit" className="w-24">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{Object.keys(QUOTA_UNITS).map((unit) => (
								<SelectItem key={unit} value={unit}>
									{unit}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</Appear>
		</div>
	);
}

/** True when the quota is off, or on with a size above zero. */
export function quotaIsValid(value: QuotaValue): boolean {
	return !value.enabled || (Number.isFinite(value.size) && value.size > 0);
}
