import { describe, expect, test } from "bun:test";
import type { ConfigField } from "../../shared/maintenance.ts";
import { sentenceCase, validateRuntime, validateValue } from "../../shared/maintenance-rules.ts";
import {
	buildConfigUpdate,
	decodeValue,
	displayValue,
	encodeValue,
	jobState,
	mapField,
	mapForm,
	mapJobTypeConfig,
	mapObservation,
	mapProposal,
	mapRuntime,
	mapWorker,
} from "./maintenance.ts";

const fixture = (name: string) => Bun.file(`${import.meta.dir}/../../fixtures/admin/${name}.json`).json();

function field(overrides: Partial<ConfigField> = {}): ConfigField {
	return {
		name: "f",
		label: "Threshold",
		description: "",
		help: "",
		placeholder: "",
		type: "string",
		widget: "text",
		required: false,
		readOnly: false,
		sensitive: false,
		min: null,
		max: null,
		options: [],
		visibleWhen: null,
		unsupported: false,
		...overrides,
	};
}

describe("values", () => {
	test("job states are normalized", () => {
		expect(jobState("job_state_running")).toBe("running");
		expect(jobState("JOB_STATE_FAILED")).toBe("failed");
		expect(jobState("weird")).toBe("unknown");
		expect(jobState(undefined)).toBe("unknown");
	});

	test("every protojson value kind reads as plain data", () => {
		expect(displayValue(null)).toBeNull();
		expect(displayValue(() => 1)).toBeNull();
		expect(displayValue("x")).toBe("x");
		expect(displayValue([{ bool_value: true }, 2])).toEqual([true, 2]);
		expect(displayValue({ bool_value: true })).toBe(true);
		expect(displayValue({ int64_value: "42" })).toBe(42);
		expect(displayValue({ double_value: 0.5 })).toBe(0.5);
		expect(displayValue({ string_value: "a" })).toBe("a");
		expect(displayValue({ bytes_value: "AQI=" })).toBe("AQI=");
		expect(displayValue({ duration_value: "90s" })).toBe("90s");
		expect(displayValue({ string_list: { values: ["a", "b"] } })).toEqual(["a", "b"]);
		expect(displayValue({ int64_list: { values: ["1", "2"] } })).toEqual([1, 2]);
		expect(displayValue({ bool_list: {} })).toEqual([]);
		expect(displayValue({ list_value: { values: [{ string_value: "x" }] } })).toEqual(["x"]);
		expect(displayValue({ list_value: {} })).toEqual([]);
		expect(displayValue({ map_value: { fields: { k: { int64_value: "1" } } } })).toEqual({ k: 1 });
		expect(displayValue({ plain: { nested: true } })).toEqual({ plain: { nested: true } });
	});

	test("decoding shapes stored values for their control", () => {
		expect(decodeValue(field({ type: "bool" }), { bool_value: true })).toBe(true);
		expect(decodeValue(field({ type: "bool" }), undefined)).toBe(false);
		expect(decodeValue(field({ type: "int" }), { int64_value: "7" })).toBe(7);
		expect(decodeValue(field({ type: "int" }), undefined)).toBeNull();
		expect(decodeValue(field({ type: "double" }), { string_value: "" })).toBeNull();
		expect(decodeValue(field({ type: "duration" }), { duration_value: "3600s" })).toBe(3600);
		expect(decodeValue(field({ type: "list" }), { string_list: { values: ["a"] } })).toEqual(["a"]);
		expect(decodeValue(field({ type: "list" }), { string_value: "a, b" })).toEqual(["a", "b"]);
		expect(decodeValue(field({ type: "list" }), undefined)).toEqual([]);
		expect(decodeValue(field(), undefined)).toBe("");
		expect(decodeValue(field(), { int64_value: "3" })).toBe("3");
		expect(decodeValue(field(), { string_list: { values: ["a", "b"] } })).toBe("a,b");
		expect(decodeValue(field(), { map_value: { fields: {} } })).toBe("");
	});

	test("encoding produces the protojson kind each field type expects", () => {
		expect(encodeValue(field({ type: "bool" }), true)).toEqual({ bool_value: true });
		expect(encodeValue(field({ type: "int" }), 4.7)).toEqual({ int64_value: "4" });
		expect(encodeValue(field({ type: "double" }), 0.25)).toEqual({ double_value: 0.25 });
		expect(encodeValue(field({ type: "duration" }), 60)).toEqual({ duration_value: "60s" });
		expect(encodeValue(field({ type: "list" }), ["a"])).toEqual({ string_list: { values: ["a"] } });
		expect(encodeValue(field({ type: "list" }), "a")).toEqual({ string_list: { values: [] } });
		expect(encodeValue(field({ type: "enum" }), "ALL")).toEqual({ string_value: "ALL" });
		expect(encodeValue(field(), null)).toEqual({ string_value: "" });
	});

	test("validation explains what is wrong", () => {
		expect(validateValue(field({ type: "bool" }), "yes")).toBe("Threshold must be on or off");
		expect(validateValue(field({ type: "bool" }), false)).toBeNull();
		const number = field({ type: "double", min: 0, max: 1 });
		expect(validateValue(number, null)).toBeNull();
		expect(validateValue({ ...number, required: true }, "")).toBe("Threshold is required");
		expect(validateValue(number, "x")).toBe("Threshold must be a number");
		expect(validateValue(field({ type: "int" }), 1.5)).toBe("Threshold must be a whole number");
		expect(validateValue(number, -1)).toBe("Threshold must be at least 0");
		expect(validateValue(number, 2)).toBe("Threshold must be at most 1");
		expect(validateValue(number, 0.5)).toBeNull();
		expect(validateValue(field({ type: "list" }), [1] as never)).toBe(
			"Threshold must be a list of text values",
		);
		expect(validateValue(field({ type: "list", required: true }), [])).toBe(
			"Threshold needs at least one value",
		);
		expect(validateValue(field({ type: "list" }), ["a"])).toBeNull();
		expect(validateValue(field(), 3)).toBe("Threshold must be text");
		expect(validateValue(field({ required: true }), "  ")).toBe("Threshold is required");
		const select = field({
			type: "enum",
			options: [{ value: "A", label: "Alpha", description: "", disabled: false }],
		});
		expect(validateValue(select, "B")).toBe("Threshold must be one of Alpha");
		expect(validateValue(select, "A")).toBeNull();
		expect(validateValue(select, "")).toBeNull();
	});

	test("labels read in sentence case without breaking acronyms", () => {
		expect(sentenceCase("Garbage Threshold")).toBe("Garbage threshold");
		expect(sentenceCase("EC Shard Balance")).toBe("EC shard balance");
		expect(sentenceCase("Use ALL_COLLECTIONS In S3")).toBe("Use ALL_COLLECTIONS in S3");
	});

	test("runtime validation keeps SeaweedFS from silently resetting values", () => {
		expect(validateRuntime({ enabled: false, retryLimit: 0, detectionIntervalMinutes: 5 })).toBeNull();
		expect(validateRuntime({ enabled: "no" as never })).toBe("Enabled must be on or off");
		expect(validateRuntime({ retryBackoffSeconds: 0 })).toBe(
			"Retry backoff must be a whole number of at least 1",
		);
		expect(validateRuntime({ retryLimit: -1 })).toBe("Retry limit must be a whole number of at least 0");
		expect(validateRuntime({ bogus: 1 } as never)).toBe("Unknown scheduling setting bogus");
		expect(mapRuntime(undefined).enabled).toBe(false);
	});
});

describe("forms", () => {
	test("fields map widgets, bounds, options and visibility", () => {
		const mapped = mapField({
			name: "level",
			field_type: "CONFIG_FIELD_TYPE_DURATION",
			min_value: { duration_value: "10s" },
			max_value: { int64_value: "600" },
			visible_when_field: "mode",
			visible_when_equals: { string_value: "custom" },
			options: [{ value: "a" }],
		});
		expect(mapped).toMatchObject({
			label: "level",
			type: "duration",
			widget: "duration",
			min: 10,
			max: 600,
			visibleWhen: { field: "mode", equals: "custom" },
			options: [{ value: "a", label: "a" }],
			unsupported: false,
		});
		expect(mapField({ field_type: "CONFIG_FIELD_TYPE_OBJECT" }).unsupported).toBe(true);
		expect(mapField({ field_type: "nonsense", min_value: { string_value: "x" } })).toMatchObject({
			type: "string",
			min: null,
		});
		expect(
			mapField({ visible_when_field: "d", visible_when_equals: { duration_value: "5s" } }).visibleWhen
				?.equals,
		).toBe(5);
		expect(
			mapField({ visible_when_field: "l", visible_when_equals: { string_list: { values: [1] } } }).visibleWhen
				?.equals,
		).toEqual(["1"]);
		expect(
			mapField({ visible_when_field: "m", visible_when_equals: { map_value: {} } }).visibleWhen?.equals,
		).toBeNull();
		expect(mapForm({ sections: [{ fields: [] }] })).toBeNull();
	});

	test("every real descriptor maps to a form with known controls", async () => {
		for (const type of [
			"vacuum",
			"erasure_coding",
			"ec_balance",
			"volume_balance",
			"admin_script",
			"s3_lifecycle",
			"iceberg_maintenance",
		]) {
			const config = mapJobTypeConfig(
				await fixture(`plugin-${type}-descriptor`),
				await fixture(`plugin-${type}-config`),
			);
			expect(config.jobType).toBe(type);
			const fields = [...(config.adminForm?.sections ?? []), ...(config.workerForm?.sections ?? [])].flatMap(
				(s) => s.fields,
			);
			expect(fields.length).toBeGreaterThan(0);
			for (const f of fields) expect(f.name in config.admin || f.name in config.worker).toBe(true);
		}
	});

	test("sensitive values never leave the server", () => {
		const descriptor = {
			job_type: "x",
			worker_config_form: {
				sections: [
					{
						fields: [
							{ name: "token", field_type: "CONFIG_FIELD_TYPE_STRING", sensitive: true },
							{ name: "empty", sensitive: true },
						],
					},
				],
			},
		};
		const config = mapJobTypeConfig(descriptor, {
			worker_config_values: { token: { string_value: "s3cr3t" } },
		});
		expect(config.worker).toEqual({ token: null, empty: null });
		expect(config.secretsSet).toEqual(["worker.token"]);
		expect(JSON.stringify(config)).not.toContain("s3cr3t");
	});

	test("updates merge onto stored values and keep what Kelp did not touch", async () => {
		const descriptor = await fixture("plugin-vacuum-descriptor");
		const current = await fixture("plugin-vacuum-config");
		const { body } = buildConfigUpdate(
			descriptor,
			{
				...current,
				worker_config_values: { ...current.worker_config_values, extra: { bytes_value: "AQ==" } },
			},
			{
				worker: { garbage_threshold: 0.4 },
				admin: { volume_state: "FULL" },
				runtime: { enabled: false, detectionIntervalMinutes: 30 },
			},
		) as { body: Record<string, unknown> };
		expect(body.worker_config_values).toMatchObject({
			garbage_threshold: { double_value: 0.4 },
			extra: { bytes_value: "AQ==" },
		});
		expect(body.admin_config_values).toMatchObject({
			volume_state: { string_value: "FULL" },
			rack_filter: { string_value: "" },
		});
		expect(body.admin_runtime).toMatchObject({
			enabled: false,
			detection_interval_minutes: 30,
			retry_limit: 1,
		});
		expect(body).toMatchObject({ job_type: "vacuum", descriptor_version: 1 });
		expect(buildConfigUpdate({ job_type: "y" }, {}, {})).toEqual({
			body: {
				job_type: "y",
				descriptor_version: 0,
				admin_config_values: {},
				worker_config_values: {},
				admin_runtime: {},
			},
		});
	});

	test("updates reject unknown, read-only, unsupported and invalid values", async () => {
		const descriptor = await fixture("plugin-vacuum-descriptor");
		const current = await fixture("plugin-vacuum-config");
		const attempt = (update: Parameters<typeof buildConfigUpdate>[2]) =>
			buildConfigUpdate(descriptor, current, update);
		expect(attempt({ worker: { nope: 1 } })).toEqual({ error: "Unknown setting nope" });
		expect(attempt({ worker: { garbage_threshold: 5 } })).toEqual({
			error: "Garbage threshold must be at most 1",
		});
		expect(attempt({ admin: { volume_state: "X" } })).toHaveProperty("error");
		expect(attempt({ runtime: { retryBackoffSeconds: 0 } })).toHaveProperty("error");
		const locked = {
			admin_config_form: {
				sections: [
					{
						fields: [
							{ name: "ro", label: "Locked", read_only: true },
							{ name: "secret", sensitive: true },
						],
					},
				],
			},
		};
		expect(buildConfigUpdate(locked, {}, { admin: { ro: "x" } })).toEqual({
			error: "Locked cannot be changed",
		});
		const kept = buildConfigUpdate(
			locked,
			{ admin_config_values: { secret: { string_value: "old" } } },
			{ admin: { secret: null } },
		);
		expect(kept).toMatchObject({ body: { admin_config_values: { secret: { string_value: "old" } } } });
		const changed = buildConfigUpdate(locked, {}, { admin: { secret: "new" } });
		expect(changed).toMatchObject({ body: { admin_config_values: { secret: { string_value: "new" } } } });
	});
});

describe("workers, proposals, observations", () => {
	test("workers read heartbeat slots and running work", () => {
		const worker = mapWorker({
			WorkerID: "w1",
			WorkerVersion: "30GB 4.52 abc",
			Capabilities: { b: { job_type: "b", display_name: "Bravo" }, a: { job_type: "a" } },
			Heartbeat: {
				detection_slots_used: 1,
				detection_slots_total: 2,
				queued_jobs_by_type: { vacuum: 3 },
				running_work: [
					{
						work_id: "x",
						kind: "WORK_KIND_EXECUTION",
						job_type: "vacuum",
						state: "JOB_STATE_RUNNING",
						progress_percent: 40,
					},
					{ work_id: "y", kind: "other" },
				],
			},
		});
		expect(worker.version).toBe("4.52 abc");
		expect(worker.capabilities.map((c) => c.displayName)).toEqual(["a", "Bravo"]);
		expect(worker.detectionSlots).toEqual({ used: 1, total: 2 });
		expect(worker.queuedByType).toEqual({ vacuum: 3 });
		expect(worker.running).toEqual([
			{ id: "x", kind: "execution", jobType: "vacuum", state: "running", progress: 40, stage: "" },
			{ id: "y", kind: "unknown", jobType: "", state: "unknown", progress: 0, stage: "" },
		]);
	});

	test("proposal priorities and observations", () => {
		expect(mapProposal({ priority: "JOB_PRIORITY_HIGH" }).priority).toBe("high");
		expect(mapProposal({}).priority).toBe("unspecified");
		expect(
			mapObservation({
				object_id: ["b", "t"],
				object_kind: "table",
				attributes: { rows: { int64_value: "5" } },
				observed_at: "2026-01-01T00:00:00Z",
			}),
		).toMatchObject({
			objectId: ["b", "t"],
			objectKind: "table",
			attributes: { rows: 5 },
			observedAt: "2026-01-01T00:00:00.000Z",
		});
	});
});
