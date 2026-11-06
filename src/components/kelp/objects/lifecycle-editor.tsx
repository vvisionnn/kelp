import type { LifecycleRule } from "@shared/objects.ts";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Plus, ScrollText, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, useEffect, useId, useState } from "react";
import { EmptyState, ErrorState, SkeletonBlock } from "@/components/kelp/page.tsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { formatBytes } from "@/lib/format.ts";
import { useAction } from "@/lib/mutations.ts";
import { objectApi, objectKeys, objectQueries } from "@/lib/objects-queries.ts";
import { useCanWrite } from "@/lib/session.ts";

export function emptyRule(): LifecycleRule {
	return {
		id: "",
		enabled: true,
		prefix: "",
		tags: {},
		sizeGreaterThan: null,
		sizeLessThan: null,
		expirationDays: 30,
		expirationDate: null,
		expiredDeleteMarkers: false,
		noncurrentExpirationDays: null,
		newerNoncurrentVersions: null,
		abortMultipartDays: null,
	};
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Which objects a rule applies to, in a sentence fragment. */
export function describeScope(rule: LifecycleRule): string {
	const parts = [rule.prefix ? `Objects under ${rule.prefix}` : "All objects"];
	const tags = Object.entries(rule.tags);
	if (tags.length > 0) parts.push(`tagged ${tags.map(([k, v]) => `${k}=${v}`).join(", ")}`);
	if (rule.sizeGreaterThan) parts.push(`larger than ${formatBytes(rule.sizeGreaterThan)}`);
	if (rule.sizeLessThan) parts.push(`smaller than ${formatBytes(rule.sizeLessThan)}`);
	return parts.join(", ");
}

/** What a rule does, one entry per action. */
export function describeActions(rule: LifecycleRule): string[] {
	const actions: string[] = [];
	if (rule.expirationDays) actions.push(`Delete ${plural(rule.expirationDays, "day")} after creation`);
	if (rule.expirationDate) actions.push(`Delete on ${rule.expirationDate}`);
	if (rule.expiredDeleteMarkers) actions.push("Remove delete markers with no versions left");
	if (rule.noncurrentExpirationDays) {
		actions.push(
			`Delete old versions ${plural(rule.noncurrentExpirationDays, "day")} after they are replaced`,
		);
	}
	if (rule.newerNoncurrentVersions)
		actions.push(`Always keep the newest ${plural(rule.newerNoncurrentVersions, "old version")}`);
	if (rule.abortMultipartDays) {
		actions.push(`Abandon unfinished uploads after ${plural(rule.abortMultipartDays, "day")}`);
	}
	return actions;
}

/** The first problem SeaweedFS would reject, or null. */
export function ruleProblem(rule: LifecycleRule, others: LifecycleRule[]): string | null {
	if (rule.id.length > 255) return "Keep the rule name under 255 characters.";
	if (rule.id && others.some((other) => other.id === rule.id)) return "Another rule already uses that name.";
	if (rule.expirationDays && rule.expirationDate)
		return "Expire after a number of days or on a date, not both.";
	if (rule.expiredDeleteMarkers && (rule.expirationDays || rule.expirationDate)) {
		return "Removing delete markers cannot be combined with an expiration.";
	}
	if (rule.sizeGreaterThan && rule.sizeLessThan && rule.sizeGreaterThan >= rule.sizeLessThan) {
		return "The minimum size must be smaller than the maximum size.";
	}
	if (Object.entries(rule.tags).some(([k, v]) => !k.trim() || !v.trim()))
		return "Fill in every tag key and value.";
	if (describeActions(rule).length === 0) return "Choose at least one action.";
	return null;
}

const SIZE_UNITS = { B: 1, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3 } as const;
type SizeUnit = keyof typeof SIZE_UNITS;

export function splitSize(bytes: number | null): { value: string; unit: SizeUnit } {
	if (!bytes) return { value: "", unit: "MiB" };
	for (const unit of ["GiB", "MiB", "KiB"] as const) {
		if (bytes % SIZE_UNITS[unit] === 0) return { value: String(bytes / SIZE_UNITS[unit]), unit };
	}
	return { value: String(bytes), unit: "B" };
}

function SizeInput({
	label,
	bytes,
	onChange,
}: {
	label: string;
	bytes: number | null;
	onChange: (bytes: number | null) => void;
}) {
	const [state, setState] = useState(() => splitSize(bytes));
	const update = (next: { value: string; unit: SizeUnit }) => {
		setState(next);
		const n = Number(next.value);
		onChange(next.value === "" || !(n > 0) ? null : Math.round(n * SIZE_UNITS[next.unit]));
	};
	return (
		<div className="flex gap-2">
			<Input
				aria-label={label}
				type="number"
				min={0}
				step="any"
				placeholder="Any"
				className="tabular"
				value={state.value}
				onChange={(e) => update({ ...state, value: e.target.value })}
			/>
			<Select value={state.unit} onValueChange={(unit) => update({ ...state, unit: unit as SizeUnit })}>
				<SelectTrigger aria-label={`${label} unit`} className="w-24">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{Object.keys(SIZE_UNITS).map((unit) => (
						<SelectItem key={unit} value={unit}>
							{unit}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

function DaysInput({
	label,
	value,
	onChange,
	id,
}: {
	label: string;
	value: number | null;
	onChange: (value: number | null) => void;
	id?: string;
}) {
	return (
		<Input
			id={id}
			aria-label={label}
			type="number"
			min={1}
			inputMode="numeric"
			placeholder="Off"
			className="tabular"
			value={value ?? ""}
			onChange={(e) =>
				onChange(
					e.target.value === "" || !(Number(e.target.value) > 0) ? null : Math.floor(Number(e.target.value)),
				)
			}
		/>
	);
}

type Expiry = "none" | "days" | "date";

function RuleSheet({
	rule,
	isNew,
	others,
	onSave,
	onClose,
}: {
	rule: LifecycleRule | null;
	isNew: boolean;
	others: LifecycleRule[];
	onSave: (rule: LifecycleRule) => void;
	onClose: () => void;
}) {
	const id = useId();
	const [draft, setDraft] = useState<LifecycleRule>(rule ?? emptyRule());
	const [tags, setTags] = useState<Array<[string, string]>>([]);
	const [expiry, setExpiry] = useState<Expiry>("days");
	useEffect(() => {
		const next = rule ?? emptyRule();
		setDraft(next);
		setTags(Object.entries(next.tags));
		setExpiry(next.expirationDate ? "date" : next.expirationDays ? "days" : "none");
	}, [rule]);

	const set = (patch: Partial<LifecycleRule>) => setDraft((d) => ({ ...d, ...patch }));
	const final: LifecycleRule = {
		...draft,
		tags: Object.fromEntries(tags),
		expirationDays: expiry === "days" ? draft.expirationDays : null,
		expirationDate: expiry === "date" ? draft.expirationDate : null,
	};
	const problem = ruleProblem(final, others);

	function submit(event: FormEvent) {
		event.preventDefault();
		if (!problem) onSave(final);
	}

	return (
		<Sheet open={rule !== null} onOpenChange={(open) => !open && onClose()}>
			<SheetContent className="w-full overflow-y-auto sm:max-w-lg">
				<form onSubmit={submit} className="flex min-h-full flex-col gap-6">
					<SheetHeader>
						<SheetTitle>{isNew ? "New lifecycle rule" : "Edit lifecycle rule"}</SheetTitle>
						<SheetDescription>Rules run once a day and act on objects that match.</SheetDescription>
					</SheetHeader>
					<div className="grid gap-5 px-4">
						<Field>
							<FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
							<Input
								id={`${id}-name`}
								value={draft.id}
								placeholder="expire-logs"
								autoComplete="off"
								onChange={(e) => set({ id: e.target.value })}
							/>
						</Field>
						<div className="flex items-center justify-between gap-4">
							<label htmlFor={`${id}-enabled`} className="font-medium text-sm">
								Rule is active
							</label>
							<Switch
								id={`${id}-enabled`}
								checked={draft.enabled}
								onCheckedChange={(enabled) => set({ enabled })}
							/>
						</div>

						<fieldset className="grid gap-3">
							<legend className="mb-2 font-medium text-sm">Applies to</legend>
							<Field>
								<FieldLabel htmlFor={`${id}-prefix`}>Key prefix</FieldLabel>
								<Input
									id={`${id}-prefix`}
									value={draft.prefix}
									placeholder="logs/  (empty for the whole bucket)"
									className="font-mono"
									onChange={(e) => set({ prefix: e.target.value })}
								/>
							</Field>
							<div className="grid gap-2">
								<span className="text-sm">Object tags</span>
								{tags.map(([key, value], index) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: rows are edited in place.
									<div key={index} className="flex gap-2">
										<Input
											aria-label="Tag key"
											placeholder="key"
											value={key}
											onChange={(e) =>
												setTags(tags.map((t, i) => (i === index ? [e.target.value, t[1]] : t)))
											}
										/>
										<Input
											aria-label="Tag value"
											placeholder="value"
											value={value}
											onChange={(e) =>
												setTags(tags.map((t, i) => (i === index ? [t[0], e.target.value] : t)))
											}
										/>
										<Button
											variant="ghost"
											size="icon"
											aria-label="Remove tag"
											onClick={() => setTags(tags.filter((_, i) => i !== index))}
										>
											<X />
										</Button>
									</div>
								))}
								<Button
									variant="outline"
									size="sm"
									className="justify-self-start"
									onClick={() => setTags([...tags, ["", ""]])}
								>
									<Plus />
									Add tag
								</Button>
							</div>
							<div className="grid gap-3 sm:grid-cols-2">
								<div className="grid gap-1.5">
									<span className="text-sm">Larger than</span>
									<SizeInput
										key={`gt-${rule?.id}`}
										label="Minimum size"
										bytes={draft.sizeGreaterThan}
										onChange={(sizeGreaterThan) => set({ sizeGreaterThan })}
									/>
								</div>
								<div className="grid gap-1.5">
									<span className="text-sm">Smaller than</span>
									<SizeInput
										key={`lt-${rule?.id}`}
										label="Maximum size"
										bytes={draft.sizeLessThan}
										onChange={(sizeLessThan) => set({ sizeLessThan })}
									/>
								</div>
							</div>
						</fieldset>

						<fieldset className="grid gap-3">
							<legend className="mb-2 font-medium text-sm">Current objects</legend>
							<RadioGroup
								aria-label="Expire objects"
								value={expiry}
								onValueChange={(value) => setExpiry(value as Expiry)}
								className="grid gap-2"
							>
								<label htmlFor={`${id}-none`} className="flex items-center gap-2 text-sm">
									<RadioGroupItem id={`${id}-none`} value="none" />
									Keep them
								</label>
								<label htmlFor={`${id}-days`} className="flex items-center gap-2 text-sm">
									<RadioGroupItem id={`${id}-days`} value="days" />
									Delete a number of days after creation
								</label>
								{expiry === "days" && (
									<div className="pl-6">
										<DaysInput
											label="Days until deletion"
											value={draft.expirationDays}
											onChange={(expirationDays) => set({ expirationDays })}
										/>
									</div>
								)}
								<label htmlFor={`${id}-date`} className="flex items-center gap-2 text-sm">
									<RadioGroupItem id={`${id}-date`} value="date" />
									Delete on a date
								</label>
								{expiry === "date" && (
									<div className="pl-6">
										<Input
											aria-label="Deletion date"
											type="date"
											value={draft.expirationDate ?? ""}
											onChange={(e) => set({ expirationDate: e.target.value || null })}
										/>
									</div>
								)}
							</RadioGroup>
						</fieldset>

						<fieldset className="grid gap-3">
							<legend className="mb-2 font-medium text-sm">Versions and uploads</legend>
							<Field>
								<FieldLabel htmlFor={`${id}-noncurrent`}>Delete old versions after (days)</FieldLabel>
								<DaysInput
									id={`${id}-noncurrent`}
									label="Delete old versions after"
									value={draft.noncurrentExpirationDays}
									onChange={(noncurrentExpirationDays) => set({ noncurrentExpirationDays })}
								/>
								<FieldDescription>Counted from when a newer version replaced it.</FieldDescription>
							</Field>
							<Field>
								<FieldLabel htmlFor={`${id}-newer`}>Always keep this many old versions</FieldLabel>
								<DaysInput
									id={`${id}-newer`}
									label="Old versions to keep"
									value={draft.newerNoncurrentVersions}
									onChange={(newerNoncurrentVersions) => set({ newerNoncurrentVersions })}
								/>
							</Field>
							<div className="flex items-center justify-between gap-4">
								<label htmlFor={`${id}-markers`} className="grid gap-0.5">
									<span className="text-sm">Remove leftover delete markers</span>
									<span className="text-muted-foreground text-xs">Markers whose versions are all gone.</span>
								</label>
								<Switch
									id={`${id}-markers`}
									checked={draft.expiredDeleteMarkers}
									onCheckedChange={(expiredDeleteMarkers) => set({ expiredDeleteMarkers })}
								/>
							</div>
							<Field>
								<FieldLabel htmlFor={`${id}-multipart`}>Abandon unfinished uploads after (days)</FieldLabel>
								<DaysInput
									id={`${id}-multipart`}
									label="Abandon unfinished uploads after"
									value={draft.abortMultipartDays}
									onChange={(abortMultipartDays) => set({ abortMultipartDays })}
								/>
							</Field>
						</fieldset>
					</div>
					<SheetFooter className="mt-auto flex-row items-center justify-between gap-3 border-t">
						<p className="text-destructive text-xs" role={problem ? "alert" : undefined}>
							{problem}
						</p>
						<Button type="submit" disabled={Boolean(problem)}>
							Keep rule
						</Button>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}

let lastKey = 0;
const nextKey = () => ++lastKey;
type Item = { key: number; rule: LifecycleRule };
const keyed = (rules: LifecycleRule[]): Item[] => rules.map((rule) => ({ key: nextKey(), rule }));

export function LifecycleEditor({ bucket }: { bucket: string }) {
	const canWrite = useCanWrite();
	const { data, isPending, error, refetch } = useQuery(objectQueries.lifecycle(bucket));
	const [items, setItems] = useState<Item[]>([]);
	const [editing, setEditing] = useState<{ index: number; rule: LifecycleRule } | null>(null);
	useEffect(() => setItems(keyed(data ?? [])), [data]);
	const rules = items.map((item) => item.rule);

	const save = useAction({
		run: (next: LifecycleRule[]) => objectApi.setLifecycle(bucket, next),
		success: (_out, next) => (next.length === 0 ? "Lifecycle rules removed" : "Lifecycle rules saved"),
		invalidate: [objectKeys.bucket(bucket), objectKeys.buckets],
	});

	if (isPending) return <SkeletonBlock className="h-40 rounded-lg" />;
	if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

	const dirty = JSON.stringify(rules) !== JSON.stringify(data);
	const keep = (rule: LifecycleRule) => {
		setItems((current) =>
			editing && editing.index >= 0
				? current.map((item, i) => (i === editing.index ? { ...item, rule } : item))
				: [...current, { key: nextKey(), rule }],
		);
		setEditing(null);
	};

	return (
		<div className="grid gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className="max-w-prose text-muted-foreground text-sm">
					Lifecycle rules delete objects, old versions and abandoned uploads on a schedule.
				</p>
				{canWrite && (
					<Button variant="outline" onClick={() => setEditing({ index: -1, rule: emptyRule() })}>
						<Plus />
						Add rule
					</Button>
				)}
			</div>

			{rules.length === 0 ? (
				<EmptyState
					icon={<ScrollText />}
					title="No lifecycle rules"
					description="Objects stay until someone deletes them."
				/>
			) : (
				<ul className="group-sheet divide-y divide-border">
					<AnimatePresence initial={false}>
						{items.map(({ key, rule }, index) => (
							<motion.li
								key={key}
								layout
								initial={{ opacity: 0, y: 6 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, x: -12 }}
								className="flex flex-wrap items-start gap-4 px-4 py-3"
							>
								<div className="grid min-w-0 flex-1 gap-1.5">
									<div className="flex flex-wrap items-center gap-2">
										<span className="font-semibold text-[13px]">{rule.id || `Rule ${index + 1}`}</span>
										<Badge
											variant={rule.enabled ? "secondary" : "outline"}
											className={rule.enabled ? "bg-success/12 text-success-foreground" : undefined}
										>
											{rule.enabled ? "Active" : "Paused"}
										</Badge>
									</div>
									<p className="text-[12px] text-muted-foreground">{describeScope(rule)}</p>
									<ul className="grid gap-0.5 text-[13px]">
										{describeActions(rule).map((action) => (
											<li key={action}>{action}</li>
										))}
									</ul>
								</div>
								{canWrite && (
									<div className="flex items-center gap-1">
										<Switch
											aria-label={`${rule.enabled ? "Pause" : "Activate"} ${rule.id || `rule ${index + 1}`}`}
											checked={rule.enabled}
											onCheckedChange={(enabled) =>
												setItems(
													items.map((item, i) =>
														i === index ? { ...item, rule: { ...rule, enabled } } : item,
													),
												)
											}
										/>
										<Button
											variant="ghost"
											size="icon"
											aria-label={`Edit ${rule.id || `rule ${index + 1}`}`}
											onClick={() => setEditing({ index, rule })}
										>
											<Pencil />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											aria-label={`Remove ${rule.id || `rule ${index + 1}`}`}
											onClick={() => setItems(items.filter((_, i) => i !== index))}
										>
											<Trash2 />
										</Button>
									</div>
								)}
							</motion.li>
						))}
					</AnimatePresence>
				</ul>
			)}

			<AnimatePresence>
				{canWrite && dirty && (
					<motion.div
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 8 }}
						className="glass sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-xl py-2 pr-2 pl-4"
					>
						<span className="text-[13px]">You have unsaved rule changes.</span>
						<div className="flex gap-2">
							<Button variant="ghost" onClick={() => setItems(keyed(data ?? []))}>
								Discard
							</Button>
							<Button disabled={save.isPending} onClick={() => save.mutate(rules)} pending={save.isPending}>
								Save rules
							</Button>
						</div>
					</motion.div>
				)}
			</AnimatePresence>

			<RuleSheet
				rule={editing?.rule ?? null}
				isNew={editing?.index === -1}
				others={rules.filter((_, i) => i !== editing?.index)}
				onSave={keep}
				onClose={() => setEditing(null)}
			/>
		</div>
	);
}
