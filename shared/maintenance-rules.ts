/**
 * Validation for maintenance settings, shared by the server (authoritative) and the settings form
 * (instant feedback), so both always agree.
 */
import type { ConfigField, ConfigValue, RuntimeSettings } from "./maintenance.ts";

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

export const RUNTIME_LABELS: Record<keyof RuntimeSettings, string> = {
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

/** "Garbage Threshold" → "Garbage threshold", keeping acronyms like EC, S3 and ALL_COLLECTIONS. */
export function sentenceCase(text: string): string {
	return text
		.split(" ")
		.map((word, index) => {
			if (index === 0 || /[A-Z].*[A-Z]|\d/.test(word)) return word;
			return word.toLowerCase();
		})
		.join(" ");
}
