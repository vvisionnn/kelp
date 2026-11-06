import type {
	ConfigField,
	ConfigForm,
	ConfigValue,
	JobTypeConfig,
	RuntimeSettings,
	UpdateJobTypeConfig,
} from "@shared/maintenance.ts";
import { RUNTIME_LABELS, validateRuntime, validateValue } from "@shared/maintenance-rules.ts";
import { Lock } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatDuration } from "./parts.tsx";

type Scope = "admin" | "worker";

interface Draft {
	admin: Record<string, ConfigValue>;
	worker: Record<string, ConfigValue>;
	runtime: RuntimeSettings;
}

/** Schedule settings every job type shares, with the unit each number is in. */
const RUNTIME_FIELDS: Array<{
	key: Exclude<keyof RuntimeSettings, "enabled">;
	unit: string;
	description: string;
}> = [
	{
		key: "detectionIntervalMinutes",
		unit: "minutes",
		description: "How often the scheduler looks for work of this type.",
	},
	{ key: "detectionTimeoutSeconds", unit: "seconds", description: "How long one detection scan may take." },
	{ key: "maxJobsPerDetection", unit: "jobs", description: "The most jobs one detection scan may queue." },
	{
		key: "globalExecutionConcurrency",
		unit: "jobs",
		description: "Jobs of this type that may run at once across the cluster.",
	},
	{
		key: "perWorkerExecutionConcurrency",
		unit: "jobs",
		description: "Jobs of this type one worker may run at once.",
	},
	{
		key: "retryLimit",
		unit: "retries",
		description: "Extra attempts after a job fails. Use 0 to never retry.",
	},
	{ key: "retryBackoffSeconds", unit: "seconds", description: "Wait before retrying a failed job." },
	{ key: "executionTimeoutSeconds", unit: "seconds", description: "Deadline for a single attempt." },
	{
		key: "jobTypeMaxRuntimeSeconds",
		unit: "seconds",
		description: "Budget for a job across all of its attempts.",
	},
];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function fieldsOf(form: ConfigForm | null): ConfigField[] {
	return form?.sections.flatMap((s) => s.fields) ?? [];
}

/** Whether a field's visibility condition holds for the current draft values. */
export function isVisible(field: ConfigField, values: Record<string, ConfigValue>): boolean {
	return !field.visibleWhen || same(values[field.visibleWhen.field], field.visibleWhen.equals);
}

/** The edits between the saved config and the draft, in the shape the API accepts. */
export function diffConfig(
	config: JobTypeConfig,
	draft: Draft,
): { update: UpdateJobTypeConfig; count: number } {
	const update: UpdateJobTypeConfig = {};
	let count = 0;
	for (const scope of ["admin", "worker"] as const) {
		const changed = Object.fromEntries(
			Object.entries(draft[scope]).filter(([key, value]) => !same(value, config[scope][key])),
		);
		if (Object.keys(changed).length > 0) {
			update[scope] = changed;
			count += Object.keys(changed).length;
		}
	}
	const runtime = Object.fromEntries(
		Object.entries(draft.runtime).filter(
			([key, value]) => !same(value, config.runtime[key as keyof RuntimeSettings]),
		),
	) as Partial<RuntimeSettings>;
	if (Object.keys(runtime).length > 0) {
		update.runtime = runtime;
		count += Object.keys(runtime).length;
	}
	return { update, count };
}

export function SettingsForm({
	config,
	canWrite,
	onSave,
}: {
	config: JobTypeConfig;
	canWrite: boolean;
	onSave: (update: UpdateJobTypeConfig) => Promise<unknown>;
}) {
	const initial = useMemo<Draft>(
		() => ({ admin: { ...config.admin }, worker: { ...config.worker }, runtime: { ...config.runtime } }),
		[config],
	);
	const [draft, setDraft] = useState<Draft>(initial);
	const [saving, setSaving] = useState(false);
	const { update, count } = diffConfig(config, draft);

	const errors = useMemo(() => {
		const found: Record<string, string> = {};
		for (const scope of ["admin", "worker"] as const) {
			const form = scope === "admin" ? config.adminForm : config.workerForm;
			for (const field of fieldsOf(form)) {
				if (field.unsupported || field.readOnly || !isVisible(field, draft[scope])) continue;
				const value = draft[scope][field.name] ?? null;
				if (field.sensitive && value === null) continue;
				const problem = validateValue(field, value);
				if (problem) found[`${scope}.${field.name}`] = problem;
			}
		}
		for (const { key } of RUNTIME_FIELDS) {
			const problem = validateRuntime({ [key]: draft.runtime[key] });
			if (problem) found[`runtime.${key}`] = problem;
		}
		return found;
	}, [config, draft]);
	const invalid = Object.keys(errors).length > 0;

	const setValue = (scope: Scope, name: string, value: ConfigValue) =>
		setDraft((d) => ({ ...d, [scope]: { ...d[scope], [name]: value } }));
	const setRuntime = <K extends keyof RuntimeSettings>(key: K, value: RuntimeSettings[K]) =>
		setDraft((d) => ({ ...d, runtime: { ...d.runtime, [key]: value } }));

	async function save() {
		setSaving(true);
		try {
			await onSave(update);
		} catch {
			// The action toasts the server's reason; keep the edits so they can be fixed.
		} finally {
			setSaving(false);
		}
	}

	return (
		<form
			className="space-y-8 pb-20"
			onSubmit={(event) => {
				event.preventDefault();
				if (count > 0 && !invalid) void save();
			}}
		>
			{!canWrite && (
				<p className="flex w-fit items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-[13px] text-muted-foreground">
					<Lock className="size-3.5" />
					You have read-only access. Ask an administrator to change these settings.
				</p>
			)}

			<SettingsSection
				title="Schedule"
				description="When the scheduler looks for work and how much of it runs at once."
			>
				<SettingRow
					id="runtime-enabled"
					label="Run automatically"
					description="When off, this job type only runs when someone starts it here."
				>
					<Switch
						id="runtime-enabled"
						checked={draft.runtime.enabled}
						disabled={!canWrite}
						onCheckedChange={(checked) => setRuntime("enabled", checked)}
					/>
				</SettingRow>
				{RUNTIME_FIELDS.map(({ key, unit, description }) => (
					<SettingRow
						key={key}
						id={`runtime-${key}`}
						label={RUNTIME_LABELS[key]}
						description={`${description} Default ${config.runtimeDefaults[key]}.`}
						error={errors[`runtime.${key}`]}
					>
						<NumberInput
							id={`runtime-${key}`}
							value={draft.runtime[key]}
							unit={unit}
							step={1}
							disabled={!canWrite}
							invalid={Boolean(errors[`runtime.${key}`])}
							onChange={(value) => setRuntime(key, value ?? 0)}
						/>
						{unit === "seconds" && draft.runtime[key] >= 60 && (
							<p className="mt-1 text-right text-[12px] text-muted-foreground">
								{formatDuration(draft.runtime[key] * 1000)}
							</p>
						)}
					</SettingRow>
				))}
			</SettingsSection>

			{(["admin", "worker"] as const).map((scope) => {
				const form = scope === "admin" ? config.adminForm : config.workerForm;
				return form?.sections.map((section) => (
					<SettingsSection
						key={`${scope}-${section.id}`}
						title={section.title}
						description={section.description}
						tag={scope === "admin" ? "Detection" : "Worker"}
					>
						{section.fields
							.filter((field) => isVisible(field, draft[scope]))
							.map((field) => (
								<FieldControl
									key={field.name}
									scope={scope}
									field={field}
									value={draft[scope][field.name] ?? null}
									secretSet={config.secretsSet.includes(`${scope}.${field.name}`)}
									disabled={!canWrite}
									error={errors[`${scope}.${field.name}`]}
									onChange={(value) => setValue(scope, field.name, value)}
								/>
							))}
					</SettingsSection>
				));
			})}

			<AnimatePresence>
				{canWrite && count > 0 && (
					<motion.div
						initial={{ opacity: 0, y: 24 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 24 }}
						transition={{ type: "spring", stiffness: 420, damping: 34 }}
						className="glass sticky bottom-5 z-10 mx-auto flex w-fit max-w-full flex-wrap items-center gap-3 rounded-xl py-1.5 pr-1.5 pl-4"
						role="region"
						aria-label="Unsaved changes"
					>
						<span className="text-[13px]">
							<span className="font-semibold tabular">{count}</span> unsaved{" "}
							{count === 1 ? "change" : "changes"}
							{invalid && <span className="ml-2 text-destructive">Fix the highlighted values to save.</span>}
						</span>
						<div className="ml-auto flex gap-1.5">
							<Button type="button" variant="secondary" disabled={saving} onClick={() => setDraft(initial)}>
								Discard
							</Button>
							<Button type="submit" disabled={saving || invalid} pending={saving}>
								Save changes
							</Button>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</form>
	);
}

function SettingsSection({
	title,
	description,
	tag,
	children,
}: {
	title: string;
	description?: string;
	tag?: string;
	children: ReactNode;
}) {
	return (
		<section>
			<header className="mb-3">
				<div className="flex items-center gap-2">
					<h2 className="font-semibold text-[17px] leading-[22px] tracking-[-0.012em]">{title}</h2>
					{tag && (
						<span className="inline-flex h-5 items-center rounded-sm bg-secondary px-1.5 text-[12px] text-muted-foreground">
							{tag}
						</span>
					)}
				</div>
				{description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
			</header>
			<div className="group-sheet divide-y divide-border">{children}</div>
		</section>
	);
}

function SettingRow({
	id,
	label,
	description,
	error,
	wide = false,
	children,
}: {
	id: string;
	label: string;
	description?: string | undefined;
	error?: string | undefined;
	wide?: boolean;
	children: ReactNode;
}) {
	return (
		<div className={cn("grid gap-2 px-4 py-3", !wide && "md:grid-cols-[1fr_16rem] md:items-center md:gap-6")}>
			<div className="min-w-0">
				<label htmlFor={id} className="text-[13px]">
					{label}
				</label>
				{description && <p className="text-[12px] text-muted-foreground leading-4">{description}</p>}
			</div>
			<div className={cn("w-full", !wide && "md:flex md:w-56 md:flex-col md:items-end md:justify-self-end")}>
				{children}
				{error && (
					<p role="alert" className="mt-1 text-[12px] text-destructive">
						{error}
					</p>
				)}
			</div>
		</div>
	);
}

function NumberInput({
	id,
	value,
	unit,
	step,
	min,
	max,
	disabled,
	invalid,
	onChange,
}: {
	id: string;
	value: number | null;
	unit?: string | undefined;
	step: number | "any";
	min?: number | null;
	max?: number | null;
	disabled: boolean;
	invalid: boolean;
	onChange: (value: number | null) => void;
}) {
	return (
		<InputGroup className="w-full md:w-56">
			<InputGroupInput
				id={id}
				type="number"
				inputMode="decimal"
				className="tabular"
				value={value ?? ""}
				step={step}
				{...(min !== null && min !== undefined ? { min } : {})}
				{...(max !== null && max !== undefined ? { max } : {})}
				disabled={disabled}
				aria-invalid={invalid || undefined}
				onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
			/>
			{unit && (
				<InputGroupAddon align="inline-end">
					<InputGroupText>{unit}</InputGroupText>
				</InputGroupAddon>
			)}
		</InputGroup>
	);
}

function FieldControl({
	scope,
	field,
	value,
	secretSet,
	disabled,
	error,
	onChange,
}: {
	scope: Scope;
	field: ConfigField;
	value: ConfigValue;
	secretSet: boolean;
	disabled: boolean;
	error: string | undefined;
	onChange: (value: ConfigValue) => void;
}) {
	const id = `${scope}-${useId()}-${field.name}`;
	const locked = disabled || field.readOnly;
	const description = [field.description, field.help].filter(Boolean).join(" ");
	const row = (control: ReactNode, wide = false) => (
		<SettingRow id={id} label={field.label} description={description} error={error} wide={wide}>
			{control}
		</SettingRow>
	);

	if (field.unsupported) {
		return row(
			<p id={id} className="max-w-56 text-[12px] text-muted-foreground">
				Kelp keeps the current value. Change it with <span className="font-mono">weed shell</span>.
			</p>,
		);
	}

	switch (field.widget) {
		case "toggle":
			return row(
				<Switch
					id={id}
					checked={value === true}
					disabled={locked}
					onCheckedChange={(checked) => onChange(checked)}
				/>,
			);
		case "select":
			return row(
				<Select
					value={typeof value === "string" ? value : ""}
					disabled={locked}
					onValueChange={(next) => onChange(String(next))}
				>
					<SelectTrigger id={id} className="w-full md:w-56" aria-invalid={Boolean(error) || undefined}>
						<SelectValue placeholder={field.placeholder || "Choose…"}>
							{(selected: string) => field.options.find((o) => o.value === selected)?.label ?? selected}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{field.options.map((option) => (
							<SelectItem key={option.value} value={option.value} disabled={option.disabled}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>,
			);
		case "multiselect": {
			const selected = Array.isArray(value) ? value : [];
			return row(
				<fieldset id={id} className="grid gap-2" aria-label={field.label}>
					{field.options.map((option) => (
						<div key={option.value} className="flex items-center gap-2 text-[13px]">
							<Checkbox
								id={`${id}-${option.value}`}
								checked={selected.includes(option.value)}
								disabled={locked || option.disabled}
								onCheckedChange={(checked) =>
									onChange(checked ? [...selected, option.value] : selected.filter((v) => v !== option.value))
								}
							/>
							<label htmlFor={`${id}-${option.value}`}>{option.label}</label>
						</div>
					))}
				</fieldset>,
			);
		}
		case "textarea":
			return row(
				<Textarea
					id={id}
					value={typeof value === "string" ? value : ""}
					placeholder={field.placeholder}
					disabled={locked}
					aria-invalid={Boolean(error) || undefined}
					className="min-h-32 font-mono text-xs"
					spellCheck={false}
					onChange={(event) => onChange(event.target.value)}
				/>,
				true,
			);
		case "number":
		case "duration": {
			const isDuration = field.widget === "duration" || field.type === "duration";
			const numeric = typeof value === "number" ? value : null;
			return row(
				<div>
					<NumberInput
						id={id}
						value={numeric}
						unit={isDuration ? "seconds" : undefined}
						step={field.type === "double" ? "any" : 1}
						min={field.min}
						max={field.max}
						disabled={locked}
						invalid={Boolean(error)}
						onChange={onChange}
					/>
					{isDuration && numeric !== null && numeric > 0 && (
						<p className="mt-1 text-[12px] text-muted-foreground">{formatDuration(numeric * 1000)}</p>
					)}
				</div>,
			);
		}
		case "password":
			return row(
				<Input
					id={id}
					type="password"
					autoComplete="new-password"
					className="w-full md:w-56"
					value={typeof value === "string" ? value : ""}
					placeholder={secretSet ? "Saved. Type to replace." : field.placeholder}
					disabled={locked}
					onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
				/>,
			);
		default: {
			if (field.type === "list") {
				return row(
					<ListInput
						id={id}
						value={Array.isArray(value) ? value : []}
						placeholder={field.placeholder || "Comma-separated"}
						disabled={locked}
						onChange={onChange}
					/>,
				);
			}
			return row(
				<Input
					id={id}
					className="w-full md:w-56"
					value={typeof value === "string" ? value : ""}
					placeholder={field.placeholder}
					disabled={locked}
					aria-invalid={Boolean(error) || undefined}
					onChange={(event) => onChange(event.target.value)}
				/>,
			);
		}
	}
}

/** Comma-separated list editing that keeps exactly what the person typed until they leave the field. */
function ListInput({
	id,
	value,
	placeholder,
	disabled,
	onChange,
}: {
	id: string;
	value: string[];
	placeholder: string;
	disabled: boolean;
	onChange: (value: string[]) => void;
}) {
	const [text, setText] = useState(value.join(", "));
	return (
		<Input
			id={id}
			className="w-full md:w-56"
			value={text}
			placeholder={placeholder}
			disabled={disabled}
			onChange={(event) => {
				setText(event.target.value);
				onChange(
					event.target.value
						.split(",")
						.map((v) => v.trim())
						.filter(Boolean),
				);
			}}
			onBlur={() => setText(value.join(", "))}
		/>
	);
}
