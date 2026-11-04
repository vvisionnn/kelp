/**
 * Maps the SeaweedFS admin plugin API (protojson ConfigValues, snake_case Go structs) into Kelp's
 * maintenance contract, and turns edited form values back into a PersistedJobTypeConfig.
 */
import type {
	ConfigField,
	ConfigForm,
	ConfigValue,
	DetectionResult,
	DisplayValue,
	FieldType,
	FieldWidget,
	JobDetail,
	JobProposal,
	JobRun,
	JobState,
	JobTypeConfig,
	JobTypeSummary,
	MaintenanceActivity,
	MaintenanceJob,
	MaintenanceLane,
	MaintenanceWorker,
	Observation,
	RunResult,
	RuntimeSettings,
	SchedulerSummary,
	UpdateJobTypeConfig,
} from "../../shared/maintenance.ts";
import { bool, list, num, obj, type Raw, str, strings, time } from "./raw.ts";

const JOB_STATES = new Set<JobState>(["pending", "assigned", "running", "succeeded", "failed", "canceled"]);

/** `job_state_succeeded` / `JOB_STATE_SUCCEEDED` → `succeeded`. */
export function jobState(value: unknown): JobState {
	const state = str(value)
		.toLowerCase()
		.replace(/^job_state_/, "") as JobState;
	return JOB_STATES.has(state) ? state : "unknown";
}

/** Protojson duration ("90s", "1.5s") → seconds. */
function durationSeconds(value: unknown): number {
	const match = /^(-?\d+(?:\.\d+)?)s$/.exec(str(value));
	return match ? Number(match[1]) : num(value);
}

/** Any protojson ConfigValue (or plain JSON) as something a person can read. */
export function displayValue(value: unknown): DisplayValue {
	if (value === null || value === undefined) return null;
	if (typeof value !== "object")
		return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
			? value
			: null;
	if (Array.isArray(value)) return value.map(displayValue);
	const raw = value as Raw;
	if ("bool_value" in raw) return bool(raw.bool_value);
	if ("int64_value" in raw) return num(raw.int64_value);
	if ("double_value" in raw) return num(raw.double_value);
	if ("string_value" in raw) return str(raw.string_value);
	if ("bytes_value" in raw) return str(raw.bytes_value);
	if ("duration_value" in raw) return `${durationSeconds(raw.duration_value)}s`;
	for (const key of ["string_list", "int64_list", "double_list", "bool_list"]) {
		if (key in raw) {
			const values = obj(raw[key]).values;
			return Array.isArray(values)
				? values.map((v) => (key === "int64_list" ? num(v) : displayValue(v)))
				: [];
		}
	}
	if ("list_value" in raw) {
		const values = obj(raw.list_value).values;
		return Array.isArray(values) ? values.map(displayValue) : [];
	}
	if ("map_value" in raw) return displayMap(obj(raw.map_value).fields);
	return displayMap(raw);
}

export function displayMap(value: unknown): Record<string, DisplayValue> {
	return Object.fromEntries(Object.entries(obj(value)).map(([key, v]) => [key, displayValue(v)]));
}

function stringMap(value: unknown): Record<string, string> {
	return Object.fromEntries(Object.entries(obj(value)).map(([key, v]) => [key, str(v)]));
}

export function mapJob(raw: Raw): MaintenanceJob {
	return {
		id: str(raw.job_id),
		jobType: str(raw.job_type),
		state: jobState(raw.state),
		progress: num(raw.progress),
		stage: str(raw.stage),
		message: str(raw.message),
		summary: str(raw.summary),
		detail: str(raw.detail),
		workerId: str(raw.worker_id),
		requestId: str(raw.request_id),
		attempt: num(raw.attempt),
		createdAt: time(raw.created_at),
		updatedAt: time(raw.updated_at),
		completedAt: time(raw.completed_at),
		errorMessage: str(raw.error_message),
		resultSummary: str(raw.result_summary),
	};
}

export function mapActivity(raw: Raw): MaintenanceActivity {
	return {
		jobId: str(raw.job_id),
		jobType: str(raw.job_type),
		requestId: str(raw.request_id),
		workerId: str(raw.worker_id),
		source: str(raw.source),
		stage: str(raw.stage),
		message: str(raw.message),
		details: displayMap(raw.details),
		occurredAt: time(raw.occurred_at),
	};
}

export function mapRun(raw: Raw): JobRun {
	return {
		runId: str(raw.run_id),
		jobId: str(raw.job_id),
		jobType: str(raw.job_type),
		workerId: str(raw.worker_id),
		outcome: str(raw.outcome),
		message: str(raw.message),
		durationMs: num(raw.duration_ms),
		completedAt: time(raw.completed_at),
	};
}

/** Successful and failed runs as one newest-first list. */
export function mapRunHistory(raw: Raw): JobRun[] {
	return [...list(raw.successful_runs), ...list(raw.error_runs)]
		.map(mapRun)
		.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
}

export function mapJobDetail(raw: Raw): JobDetail {
	const job = obj(raw.job);
	return {
		job: {
			...mapJob(job),
			// `*_pb` entries are serialized protobufs meant for workers, not people.
			parameters: Object.fromEntries(
				Object.entries(displayMap(job.parameters)).filter(([key]) => !key.endsWith("_pb")),
			),
			labels: stringMap(job.labels),
			outputs: displayMap(job.result_output_values),
		},
		run: raw.run_record ? mapRun(obj(raw.run_record)) : null,
		activities: list(raw.activities).map(mapActivity),
		related: list(raw.related_jobs).map(mapJob),
	};
}

export function mapWorker(raw: Raw): MaintenanceWorker {
	const heartbeat = obj(raw.Heartbeat);
	return {
		id: str(raw.WorkerID),
		instance: str(raw.WorkerInstance),
		address: str(raw.Address),
		version: str(raw.WorkerVersion).replace(/^\d+GB\s+/, ""),
		protocol: str(raw.ProtocolVersion),
		connectedAt: time(raw.ConnectedAt),
		lastSeenAt: time(raw.LastSeenAt),
		capabilities: Object.values(obj(raw.Capabilities))
			.map((c) => {
				const cap = obj(c);
				return {
					jobType: str(cap.job_type),
					displayName: str(cap.display_name) || str(cap.job_type),
					canDetect: bool(cap.can_detect),
					canExecute: bool(cap.can_execute),
					maxDetectionConcurrency: num(cap.max_detection_concurrency),
					maxExecutionConcurrency: num(cap.max_execution_concurrency),
				};
			})
			.sort((a, b) => a.displayName.localeCompare(b.displayName)),
		detectionSlots: {
			used: num(heartbeat.detection_slots_used),
			total: num(heartbeat.detection_slots_total),
		},
		executionSlots: {
			used: num(heartbeat.execution_slots_used),
			total: num(heartbeat.execution_slots_total),
		},
		queuedByType: Object.fromEntries(
			Object.entries(obj(heartbeat.queued_jobs_by_type)).map(([k, v]) => [k, num(v)]),
		),
		running: list(heartbeat.running_work).map((w) => {
			const kind = str(w.kind)
				.toLowerCase()
				.replace(/^work_kind_/, "");
			return {
				id: str(w.work_id),
				kind: kind === "detection" || kind === "execution" ? kind : "unknown",
				jobType: str(w.job_type),
				state: jobState(w.state),
				progress: num(w.progress_percent),
				stage: str(w.stage),
			};
		}),
	};
}

export function mapScheduler(raw: Raw): SchedulerSummary {
	const scheduler = obj(raw.scheduler);
	const lock = obj(raw.lock);
	return {
		enabled: bool(raw.enabled),
		phase: str(scheduler.current_phase),
		currentJobType: str(scheduler.current_job_type),
		nextDetectionAt: time(scheduler.next_detection_at),
		lastIterationDoneAt: time(scheduler.last_iteration_done_at),
		tickSeconds: num(scheduler.scheduler_tick_seconds),
		lockHeld: bool(lock.held),
		lastLockAcquiredAt: time(lock.last_acquired_at),
	};
}

export function mapLane(raw: Raw): MaintenanceLane {
	const status = obj(raw.status);
	return {
		name: str(raw.lane),
		jobTypes: strings(raw.job_types),
		phase: str(status.current_phase),
		nextDetectionAt: time(status.next_detection_at),
		idleSleepSeconds: num(raw.idle_sleep_sec),
	};
}

/**
 * One row per registered job type, combining the registry (names), scheduler states (timing,
 * last run), the scheduler's detection bookkeeping and worker capabilities (descriptions).
 */
export function mapJobTypeSummaries(
	jobTypes: Raw[],
	states: Raw[],
	schedulerStatus: Raw,
	workers: Raw[],
): JobTypeSummary[] {
	const stateBy = new Map(states.map((s) => [str(s.job_type), s]));
	const detectionBy = new Map(
		list(obj(schedulerStatus.scheduler).job_types).map((s) => [str(s.job_type), s]),
	);
	const descriptions = new Map<string, string>();
	for (const worker of workers) {
		for (const cap of Object.values(obj(worker.Capabilities))) {
			const c = obj(cap);
			if (str(c.description)) descriptions.set(str(c.job_type), str(c.description));
		}
	}
	return jobTypes.map((t) => {
		const jobType = str(t.job_type);
		const state = stateBy.get(jobType) ?? {};
		const detection = detectionBy.get(jobType) ?? {};
		return {
			jobType,
			displayName: str(t.display_name) || jobType,
			description: descriptions.get(jobType) ?? "",
			weight: num(t.weight),
			lane: str(state.lane),
			enabled: stateBy.has(jobType) ? bool(state.enabled) : false,
			detectionInFlight: bool(state.detection_in_flight),
			detectionIntervalMinutes: num(state.detection_interval_minutes),
			nextDetectionAt: time(state.next_detection_at),
			lastDetectedAt: time(detection.last_detected_at),
			lastDetectedCount: num(detection.last_detected_count),
			lastDetectionError: str(detection.last_detection_error),
			lastDetectionSkipped: str(detection.last_detection_skipped),
			lastRunStartedAt: time(state.last_run_started_at),
			lastRunCompletedAt: time(state.last_run_completed_at),
			lastRunStatus: str(state.last_run_status),
			detectorAvailable: bool(state.detector_available),
			executorWorkerCount: num(state.executor_worker_count),
			policyError: str(state.policy_error),
		};
	});
}

export function mapObservation(raw: Raw): Observation {
	return {
		objectId: strings(raw.object_id),
		objectKind: str(raw.object_kind),
		format: str(raw.format),
		jobType: str(raw.job_type),
		workerId: str(raw.worker_id),
		observedAt: time(raw.observed_at),
		attributes: displayMap(raw.attributes),
	};
}

const PRIORITIES = new Set(["low", "normal", "high", "critical"]);

export function mapProposal(raw: Raw): JobProposal {
	const priority = str(raw.priority)
		.toLowerCase()
		.replace(/^job_priority_/, "");
	return {
		id: str(raw.proposal_id),
		priority: (PRIORITIES.has(priority) ? priority : "unspecified") as JobProposal["priority"],
		summary: str(raw.summary),
		detail: str(raw.detail),
		labels: stringMap(raw.labels),
	};
}

export function mapDetection(raw: Raw): DetectionResult {
	return {
		requestId: str(raw.request_id),
		workerId: str(raw.detector_worker_id),
		totalProposals: num(raw.total_proposals),
		proposals: list(raw.proposals).map(mapProposal),
		skippedReason: str(raw.skipped_reason),
		eligibleAfter: time(raw.eligible_after),
		activities: list(raw.activities).map(mapActivity),
		error: str(raw.error),
	};
}

export function mapRunResult(raw: Raw): RunResult {
	return {
		detected: num(raw.detected_count),
		readyToExecute: num(raw.ready_to_execute_count),
		skippedActive: num(raw.skipped_active_count),
		executed: num(raw.executed_count),
		succeeded: num(raw.success_count),
		failed: num(raw.error_count),
		canceled: num(raw.canceled_count),
	};
}

// ---------------------------------------------------------------------------------------------
// Config forms

const FIELD_TYPES: Record<string, FieldType> = {
	CONFIG_FIELD_TYPE_BOOL: "bool",
	CONFIG_FIELD_TYPE_INT64: "int",
	CONFIG_FIELD_TYPE_DOUBLE: "double",
	CONFIG_FIELD_TYPE_STRING: "string",
	CONFIG_FIELD_TYPE_BYTES: "bytes",
	CONFIG_FIELD_TYPE_DURATION: "duration",
	CONFIG_FIELD_TYPE_ENUM: "enum",
	CONFIG_FIELD_TYPE_LIST: "list",
	CONFIG_FIELD_TYPE_OBJECT: "object",
};

const WIDGETS: Record<string, FieldWidget> = {
	CONFIG_WIDGET_TOGGLE: "toggle",
	CONFIG_WIDGET_TEXT: "text",
	CONFIG_WIDGET_TEXTAREA: "textarea",
	CONFIG_WIDGET_NUMBER: "number",
	CONFIG_WIDGET_SELECT: "select",
	CONFIG_WIDGET_MULTI_SELECT: "multiselect",
	CONFIG_WIDGET_DURATION: "duration",
	CONFIG_WIDGET_PASSWORD: "password",
};

const DEFAULT_WIDGET: Record<FieldType, FieldWidget> = {
	bool: "toggle",
	int: "number",
	double: "number",
	string: "text",
	enum: "select",
	duration: "duration",
	list: "text",
	bytes: "text",
	object: "textarea",
};

/** A bound (min/max) from a ConfigValue, or null when the descriptor sets none. */
function bound(value: unknown): number | null {
	if (!value || typeof value !== "object") return null;
	const shown = displayValue(value);
	if (typeof shown === "number") return shown;
	return typeof shown === "string" && shown.endsWith("s") ? durationSeconds(shown) : null;
}

export function mapField(raw: Raw): ConfigField {
	const type = FIELD_TYPES[str(raw.field_type)] ?? "string";
	const visibleField = str(raw.visible_when_field);
	return {
		name: str(raw.name),
		label: str(raw.label) || str(raw.name),
		description: str(raw.description),
		help: str(raw.help_text),
		placeholder: str(raw.placeholder),
		type,
		widget: WIDGETS[str(raw.widget)] ?? DEFAULT_WIDGET[type],
		required: bool(raw.required),
		readOnly: bool(raw.read_only),
		sensitive: bool(raw.sensitive),
		min: bound(raw.min_value),
		max: bound(raw.max_value),
		options: list(raw.options).map((o) => ({
			value: str(o.value),
			label: str(o.label) || str(o.value),
			description: str(o.description),
			disabled: bool(o.disabled),
		})),
		visibleWhen: visibleField ? { field: visibleField, equals: plainValue(raw.visible_when_equals) } : null,
		unsupported: type === "bytes" || type === "object",
	};
}

export function mapForm(raw: unknown): ConfigForm | null {
	const form = obj(raw);
	const sections = list(form.sections)
		.map((s) => ({
			id: str(s.section_id),
			title: str(s.title),
			description: str(s.description),
			fields: list(s.fields).map(mapField),
		}))
		.filter((s) => s.fields.length > 0);
	if (sections.length === 0) return null;
	return { title: str(form.title), description: str(form.description), sections };
}

function formFields(form: ConfigForm | null): ConfigField[] {
	return form?.sections.flatMap((s) => s.fields) ?? [];
}

/** A ConfigValue as an editable plain value, regardless of the field it belongs to. */
function plainValue(raw: unknown): ConfigValue {
	const shown = displayValue(raw);
	if (shown === null || typeof shown !== "object") {
		return typeof shown === "string" && raw && typeof raw === "object" && "duration_value" in (raw as Raw)
			? durationSeconds(shown)
			: shown;
	}
	return Array.isArray(shown) ? shown.map((v) => String(v)) : null;
}

/** The stored value for `field`, shaped for its control. */
export function decodeValue(field: ConfigField, raw: unknown): ConfigValue {
	const value = plainValue(raw);
	switch (field.type) {
		case "bool":
			return value === true;
		case "int":
		case "double":
		case "duration":
			return value === null || value === "" ? null : num(value, 0);
		case "list":
			return Array.isArray(value)
				? value
				: typeof value === "string" && value
					? value.split(",").map((v) => v.trim())
					: [];
		default:
			return value === null ? "" : Array.isArray(value) ? value.join(",") : String(value);
	}
}

/** A plain value back into the protojson ConfigValue its field type expects. */
export function encodeValue(field: ConfigField, value: ConfigValue): Raw {
	switch (field.type) {
		case "bool":
			return { bool_value: value === true };
		case "int":
			return { int64_value: String(Math.trunc(Number(value))) };
		case "double":
			return { double_value: Number(value) };
		case "duration":
			return { duration_value: `${Math.trunc(Number(value))}s` };
		case "list":
			return { string_list: { values: Array.isArray(value) ? value : [] } };
		default:
			return { string_value: value === null ? "" : String(value) };
	}
}

/** Why `value` is not acceptable for `field`, in words a person can act on, or null. */
export function validateValue(field: ConfigField, value: ConfigValue): string | null {
	const name = field.label;
	switch (field.type) {
		case "bool":
			return typeof value === "boolean" ? null : `${name} must be on or off`;
		case "int":
		case "double":
		case "duration": {
			if (value === null || value === "") return field.required ? `${name} is required` : null;
			if (typeof value !== "number" || !Number.isFinite(value)) return `${name} must be a number`;
			if (field.type !== "double" && !Number.isInteger(value)) return `${name} must be a whole number`;
			if (field.min !== null && value < field.min) return `${name} must be at least ${field.min}`;
			if (field.max !== null && value > field.max) return `${name} must be at most ${field.max}`;
			return null;
		}
		case "list":
			if (!Array.isArray(value) || value.some((v) => typeof v !== "string"))
				return `${name} must be a list of text values`;
			return field.required && value.length === 0 ? `${name} needs at least one value` : null;
		default: {
			if (typeof value !== "string") return `${name} must be text`;
			if (field.required && value.trim() === "") return `${name} is required`;
			if (
				field.type === "enum" &&
				field.options.length > 0 &&
				value !== "" &&
				!field.options.some((o) => o.value === value)
			) {
				return `${name} must be one of ${field.options.map((o) => o.label).join(", ")}`;
			}
			return null;
		}
	}
}

const RUNTIME_KEYS: Array<[keyof RuntimeSettings, string]> = [
	["enabled", "enabled"],
	["detectionIntervalMinutes", "detection_interval_minutes"],
	["detectionTimeoutSeconds", "detection_timeout_seconds"],
	["maxJobsPerDetection", "max_jobs_per_detection"],
	["globalExecutionConcurrency", "global_execution_concurrency"],
	["perWorkerExecutionConcurrency", "per_worker_execution_concurrency"],
	["retryLimit", "retry_limit"],
	["retryBackoffSeconds", "retry_backoff_seconds"],
	["jobTypeMaxRuntimeSeconds", "job_type_max_runtime_seconds"],
	["executionTimeoutSeconds", "execution_timeout_seconds"],
];

export function mapRuntime(raw: unknown): RuntimeSettings {
	const r = obj(raw);
	return Object.fromEntries(
		RUNTIME_KEYS.map(([key, wire]) => [key, key === "enabled" ? bool(r[wire]) : num(r[wire])]),
	) as unknown as RuntimeSettings;
}

const RUNTIME_LABELS: Record<keyof RuntimeSettings, string> = {
	enabled: "Enabled",
	detectionIntervalMinutes: "Detection interval",
	detectionTimeoutSeconds: "Detection timeout",
	maxJobsPerDetection: "Jobs per detection",
	globalExecutionConcurrency: "Cluster-wide concurrency",
	perWorkerExecutionConcurrency: "Per-worker concurrency",
	retryLimit: "Retry limit",
	retryBackoffSeconds: "Retry backoff",
	jobTypeMaxRuntimeSeconds: "Maximum runtime",
	executionTimeoutSeconds: "Execution timeout",
};

/** SeaweedFS resets runtime values at or below zero to the defaults, so Kelp requires ≥ 1 (retries ≥ 0). */
export function validateRuntime(runtime: Partial<RuntimeSettings>): string | null {
	for (const [key, value] of Object.entries(runtime) as Array<[keyof RuntimeSettings, unknown]>) {
		if (!(key in RUNTIME_LABELS)) return `Unknown scheduling setting ${key}`;
		if (key === "enabled") {
			if (typeof value !== "boolean") return "Enabled must be on or off";
			continue;
		}
		const min = key === "retryLimit" ? 0 : 1;
		if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > 2_147_483_647) {
			return `${RUNTIME_LABELS[key]} must be a whole number of at least ${min}`;
		}
	}
	return null;
}

export function mapJobTypeConfig(descriptor: Raw, config: Raw): JobTypeConfig {
	const adminForm = mapForm(descriptor.admin_config_form);
	const workerForm = mapForm(descriptor.worker_config_form);
	const secretsSet: string[] = [];
	const values = (form: ConfigForm | null, stored: unknown, prefix: string) => {
		const raw = obj(stored);
		return Object.fromEntries(
			formFields(form).map((field) => {
				const value = decodeValue(field, raw[field.name]);
				if (field.sensitive) {
					if (value !== "" && value !== null) secretsSet.push(`${prefix}.${field.name}`);
					return [field.name, null];
				}
				return [field.name, value];
			}),
		);
	};
	return {
		jobType: str(descriptor.job_type) || str(config.job_type),
		displayName: str(descriptor.display_name) || str(descriptor.job_type),
		description: str(descriptor.description),
		descriptorVersion: num(descriptor.descriptor_version),
		adminForm,
		workerForm,
		admin: values(adminForm, config.admin_config_values, "admin"),
		worker: values(workerForm, config.worker_config_values, "worker"),
		secretsSet,
		runtime: mapRuntime(config.admin_runtime),
		runtimeDefaults: mapRuntime(descriptor.admin_runtime_defaults),
		updatedAt: time(config.updated_at),
		updatedBy: str(config.updated_by),
	};
}

/** Why an edit is not acceptable, or null. Checks every edited value before anything is built. */
function editProblem(formRaw: unknown, edits: Record<string, ConfigValue> | undefined): string | null {
	const fields = new Map(formFields(mapForm(formRaw)).map((f) => [f.name, f]));
	for (const [name, value] of Object.entries(edits ?? {})) {
		const field = fields.get(name);
		if (!field) return `Unknown setting ${name}`;
		if (field.readOnly || field.unsupported) return `${field.label} cannot be changed`;
		if (field.sensitive && value === null) continue;
		const problem = validateValue(field, value);
		if (problem) return problem;
	}
	return null;
}

function applyEdits(formRaw: unknown, stored: unknown, edits: Record<string, ConfigValue> | undefined): Raw {
	const next: Raw = { ...obj(stored) };
	const fields = new Map(formFields(mapForm(formRaw)).map((f) => [f.name, f]));
	for (const [name, value] of Object.entries(edits ?? {})) {
		const field = fields.get(name) as ConfigField;
		// A sensitive field sent as null keeps its current secret.
		if (field.sensitive && value === null) continue;
		next[name] = encodeValue(field, value);
	}
	return next;
}

/**
 * Applies edited values onto the stored config. Untouched keys (including values Kelp cannot edit)
 * keep their stored protojson, so a save never drops settings Kelp does not understand.
 */
export function buildConfigUpdate(
	descriptor: Raw,
	current: Raw,
	update: UpdateJobTypeConfig,
): { body: Raw } | { error: string } {
	const error =
		editProblem(descriptor.admin_config_form, update.admin) ??
		editProblem(descriptor.worker_config_form, update.worker) ??
		validateRuntime(update.runtime ?? {});
	if (error) return { error };
	const runtime: Raw = { ...obj(current.admin_runtime) };
	for (const [key, wire] of RUNTIME_KEYS) {
		const value = update.runtime?.[key];
		if (value !== undefined) runtime[wire] = value;
	}
	return {
		body: {
			job_type: str(current.job_type) || str(descriptor.job_type),
			descriptor_version: num(descriptor.descriptor_version) || num(current.descriptor_version),
			admin_config_values: applyEdits(
				descriptor.admin_config_form,
				current.admin_config_values,
				update.admin,
			),
			worker_config_values: applyEdits(
				descriptor.worker_config_form,
				current.worker_config_values,
				update.worker,
			),
			admin_runtime: runtime,
		},
	};
}
