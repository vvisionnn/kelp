/** Contract for Kelp's maintenance (SeaweedFS admin plugin) and settings endpoints. */

export type JobState = "pending" | "assigned" | "running" | "succeeded" | "failed" | "canceled" | "unknown";

export interface SchedulerSummary {
	enabled: boolean;
	phase: string;
	currentJobType: string;
	nextDetectionAt: string | null;
	lastIterationDoneAt: string | null;
	tickSeconds: number;
	lockHeld: boolean;
	lastLockAcquiredAt: string | null;
}

export interface MaintenanceLane {
	name: string;
	jobTypes: string[];
	phase: string;
	nextDetectionAt: string | null;
	idleSleepSeconds: number;
}

export interface JobTypeSummary {
	jobType: string;
	displayName: string;
	description: string;
	weight: number;
	lane: string;
	enabled: boolean;
	detectionInFlight: boolean;
	detectionIntervalMinutes: number;
	nextDetectionAt: string | null;
	lastDetectedAt: string | null;
	lastDetectedCount: number;
	lastDetectionError: string;
	lastDetectionSkipped: string;
	lastRunStartedAt: string | null;
	lastRunCompletedAt: string | null;
	lastRunStatus: string;
	detectorAvailable: boolean;
	executorWorkerCount: number;
	policyError: string;
}

export interface WorkerCapability {
	jobType: string;
	displayName: string;
	canDetect: boolean;
	canExecute: boolean;
	maxDetectionConcurrency: number;
	maxExecutionConcurrency: number;
}

export interface RunningWork {
	id: string;
	kind: "detection" | "execution" | "unknown";
	jobType: string;
	state: JobState;
	progress: number;
	stage: string;
}

export interface MaintenanceWorker {
	id: string;
	instance: string;
	address: string;
	version: string;
	protocol: string;
	connectedAt: string | null;
	lastSeenAt: string | null;
	capabilities: WorkerCapability[];
	detectionSlots: { used: number; total: number };
	executionSlots: { used: number; total: number };
	queuedByType: Record<string, number>;
	running: RunningWork[];
}

export interface MaintenanceOverview {
	configured: boolean;
	enabled: boolean;
	workerCount: number;
	scheduler: SchedulerSummary;
	lanes: MaintenanceLane[];
	jobTypes: JobTypeSummary[];
	workers: MaintenanceWorker[];
}

/** A display-ready version of a protobuf ConfigValue. */
export type DisplayValue =
	| string
	| number
	| boolean
	| null
	| DisplayValue[]
	| { [key: string]: DisplayValue };

export interface MaintenanceJob {
	id: string;
	jobType: string;
	state: JobState;
	progress: number;
	stage: string;
	message: string;
	summary: string;
	detail: string;
	workerId: string;
	requestId: string;
	attempt: number;
	createdAt: string | null;
	updatedAt: string | null;
	completedAt: string | null;
	errorMessage: string;
	resultSummary: string;
}

export interface MaintenanceActivity {
	jobId: string;
	jobType: string;
	requestId: string;
	workerId: string;
	source: string;
	stage: string;
	message: string;
	details: Record<string, DisplayValue>;
	occurredAt: string | null;
}

export interface JobRun {
	runId: string;
	jobId: string;
	jobType: string;
	workerId: string;
	outcome: "success" | "error" | string;
	message: string;
	durationMs: number;
	completedAt: string | null;
}

export interface JobDetail {
	job: MaintenanceJob & {
		parameters: Record<string, DisplayValue>;
		labels: Record<string, string>;
		outputs: Record<string, DisplayValue>;
	};
	run: JobRun | null;
	activities: MaintenanceActivity[];
	related: MaintenanceJob[];
}

export type FieldType =
	| "bool"
	| "int"
	| "double"
	| "string"
	| "enum"
	| "duration"
	| "list"
	| "bytes"
	| "object";
export type FieldWidget =
	| "toggle"
	| "text"
	| "textarea"
	| "number"
	| "select"
	| "multiselect"
	| "duration"
	| "password";

/** A value Kelp can edit: protobuf ConfigValues are flattened to plain JSON by field type. */
export type ConfigValue = string | number | boolean | string[] | null;

export interface ConfigField {
	name: string;
	label: string;
	description: string;
	help: string;
	placeholder: string;
	type: FieldType;
	widget: FieldWidget;
	required: boolean;
	readOnly: boolean;
	sensitive: boolean;
	min: number | null;
	max: number | null;
	options: Array<{ value: string; label: string; description: string; disabled: boolean }>;
	visibleWhen: { field: string; equals: ConfigValue } | null;
	/** True when Kelp cannot edit this value type; it is shown read-only and preserved on save. */
	unsupported: boolean;
}

export interface ConfigSection {
	id: string;
	title: string;
	description: string;
	fields: ConfigField[];
}

export interface ConfigForm {
	title: string;
	description: string;
	sections: ConfigSection[];
}

export interface RuntimeSettings {
	enabled: boolean;
	detectionIntervalMinutes: number;
	detectionTimeoutSeconds: number;
	maxJobsPerDetection: number;
	globalExecutionConcurrency: number;
	perWorkerExecutionConcurrency: number;
	retryLimit: number;
	retryBackoffSeconds: number;
	jobTypeMaxRuntimeSeconds: number;
	executionTimeoutSeconds: number;
}

export interface JobTypeConfig {
	jobType: string;
	displayName: string;
	description: string;
	descriptorVersion: number;
	adminForm: ConfigForm | null;
	workerForm: ConfigForm | null;
	admin: Record<string, ConfigValue>;
	worker: Record<string, ConfigValue>;
	/** Sensitive fields that already hold a value (the value itself is never sent). */
	secretsSet: string[];
	runtime: RuntimeSettings;
	runtimeDefaults: RuntimeSettings;
	updatedAt: string | null;
	updatedBy: string;
}

export interface UpdateJobTypeConfig {
	admin?: Record<string, ConfigValue>;
	worker?: Record<string, ConfigValue>;
	runtime?: Partial<RuntimeSettings>;
}

export interface JobProposal {
	id: string;
	priority: "low" | "normal" | "high" | "critical" | "unspecified";
	summary: string;
	detail: string;
	labels: Record<string, string>;
}

export interface DetectionResult {
	requestId: string;
	workerId: string;
	totalProposals: number;
	proposals: JobProposal[];
	skippedReason: string;
	eligibleAfter: string | null;
	activities: MaintenanceActivity[];
	error: string;
}

export interface RunResult {
	detected: number;
	readyToExecute: number;
	skippedActive: number;
	executed: number;
	succeeded: number;
	failed: number;
	canceled: number;
}

export interface Observation {
	objectId: string[];
	objectKind: string;
	format: string;
	jobType: string;
	workerId: string;
	observedAt: string | null;
	attributes: Record<string, DisplayValue>;
}

export interface KelpSettings {
	version: string;
	upstreams: { label: string; url: string }[];
	s3Endpoint: string | null;
	sessionTtlHours: number;
	viewerEnabled: boolean;
}
