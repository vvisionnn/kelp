import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type Harness, harness } from "../../test/harness.ts";

let h: Harness;

const JOB_TYPES = [
	"vacuum",
	"erasure_coding",
	"ec_balance",
	"volume_balance",
	"admin_script",
	"s3_lifecycle",
	"iceberg_maintenance",
];

beforeEach(async () => {
	h = await harness();
	h.admin.fixture("GET /api/plugin/status", "admin/plugin-status");
	h.admin.fixture("GET /api/plugin/job-types", "admin/plugin-job-types");
	h.admin.fixture("GET /api/plugin/scheduler-states", "admin/plugin-scheduler-states");
	h.admin.fixture("GET /api/plugin/scheduler-status", "admin/plugin-scheduler-status");
	h.admin.fixture("GET /api/plugin/lanes", "admin/plugin-lanes");
	h.admin.fixture("GET /api/plugin/workers", "admin/plugin-workers");
	h.admin.fixture("GET /api/plugin/jobs", "admin/plugin-jobs");
	h.admin.fixture("GET /api/plugin/activities", "admin/plugin-activities");
	h.admin.on("GET /api/plugin/observations", []);
	for (const type of JOB_TYPES) {
		h.admin.fixture(`GET /api/plugin/job-types/${type}/descriptor`, `admin/plugin-${type}-descriptor`);
		h.admin.fixture(`GET /api/plugin/job-types/${type}/config`, `admin/plugin-${type}-config`);
		h.admin.fixture(`GET /api/plugin/job-types/${type}/runs`, `admin/plugin-${type}-runs`);
	}
});
afterEach(() => h.stop());

describe("maintenance overview", () => {
	test("combines scheduler, lanes, job types and workers", async () => {
		const { status, body } = await h.json("GET", "/maintenance/overview");
		expect(status).toBe(200);
		expect(body).toMatchObject({ configured: true, enabled: true, workerCount: 1 });
		expect(body.scheduler.phase).toBeTruthy();
		expect(body.lanes.map((l: { name: string }) => l.name)).toContain("default");
		expect(body.jobTypes).toHaveLength(7);
		const vacuum = body.jobTypes.find((t: { jobType: string }) => t.jobType === "vacuum");
		expect(vacuum).toMatchObject({
			displayName: "Volume Vacuum",
			lane: "default",
			enabled: true,
			detectorAvailable: true,
		});
		expect(vacuum.description).toBeTruthy();
		expect(body.workers[0].capabilities).toHaveLength(7);
		expect(body.workers[0].address).toBe("worker-1.lan");
	});

	test("job types the scheduler has not seen yet show as disabled", async () => {
		h.admin.on("GET /api/plugin/scheduler-states", []);
		h.admin.on("GET /api/plugin/workers", null);
		const { body } = await h.json("GET", "/maintenance/overview");
		expect(body.jobTypes.every((t: { enabled: boolean }) => !t.enabled)).toBe(true);
		expect(body.workerCount).toBe(0);
	});
});

describe("jobs and activity", () => {
	test("lists jobs, filtering by type upstream and by state in Kelp", async () => {
		const all = await h.json("GET", "/maintenance/jobs");
		expect(all.body.jobs.length).toBeGreaterThan(0);
		expect(h.admin.requests.at(-1)?.query).toEqual({ limit: "200" });
		const succeeded = await h.json("GET", "/maintenance/jobs?jobType=vacuum&state=succeeded&limit=2");
		expect(h.admin.requests.at(-1)?.query).toEqual({ job_type: "vacuum", limit: "1000" });
		expect(succeeded.body.jobs.length).toBeLessThanOrEqual(2);
		expect(succeeded.body.jobs.every((j: { state: string }) => j.state === "succeeded")).toBe(true);
		expect((await h.json("GET", "/maintenance/jobs?state=exploded")).status).toBe(400);
	});

	test("job detail includes parameters, outputs, the run and its timeline, without worker-only blobs", async () => {
		h.admin.fixture("GET /api/plugin/jobs/vacuum-1/detail", "admin/plugin-vacuum-job-detail");
		const { status, body } = await h.json("GET", "/maintenance/jobs/vacuum-1");
		expect(status).toBe(200);
		expect(h.admin.requests.at(-1)?.query).toEqual({ activity_limit: "200", related_limit: "20" });
		expect(body.job.state).toBe("succeeded");
		expect(body.job.parameters.volume_id).toBeGreaterThan(0);
		expect(Object.keys(body.job.parameters).some((k) => k.endsWith("_pb"))).toBe(false);
		expect(body.run.outcome).toBe("success");
		expect(body.activities.length).toBeGreaterThan(0);
	});

	test("a job without a run record", async () => {
		h.admin.on("GET /api/plugin/jobs/q/detail", {
			job: { job_id: "q", state: "job_state_pending" },
			activities: null,
		});
		const { body } = await h.json("GET", "/maintenance/jobs/q");
		expect(body).toMatchObject({
			run: null,
			activities: [],
			related: [],
			job: { id: "q", state: "pending" },
		});
	});

	test("rejects job ids that could escape the path", async () => {
		expect((await h.get("/maintenance/jobs/a%2F..%2Fb")).status).toBe(400);
	});

	test("expires a job with a reason that names who did it", async () => {
		h.admin.fixture("POST /api/plugin/jobs/vacuum-1/expire", "admin/plugin-expire-inactive");
		const { body } = await h.json("POST", "/maintenance/jobs/vacuum-1/expire", {});
		expect(JSON.parse(h.admin.requests.at(-1)?.body ?? "{}")).toEqual({
			reason: "Expired from Kelp by admin",
		});
		expect(body.expired).toBe(false);
		expect(body.job.id).toBeTruthy();
		h.admin.on("POST /api/plugin/jobs/vacuum-2/expire", { expired: true });
		const expired = await h.json("POST", "/maintenance/jobs/vacuum-2/expire", { reason: "stuck" });
		expect(JSON.parse(h.admin.requests.at(-1)?.body ?? "{}")).toEqual({ reason: "stuck" });
		expect(expired.body).toEqual({ expired: true, job: null });
		const noBody = await h.request("POST", "/maintenance/jobs/vacuum-2/expire");
		expect(noBody.status).toBe(200);
	});

	test("activities and observations", async () => {
		const { body } = await h.json("GET", "/maintenance/activities?jobType=vacuum&limit=5");
		expect(h.admin.requests.at(-1)?.query).toEqual({ job_type: "vacuum", limit: "5" });
		expect(body.activities.length).toBeGreaterThan(0);
		expect((await h.json("GET", "/maintenance/observations")).body).toEqual({ observations: [] });
	});
});

describe("job type settings", () => {
	test("reads the form and current values", async () => {
		const { body } = await h.json("GET", "/maintenance/job-types/vacuum");
		expect(body).toMatchObject({ jobType: "vacuum", displayName: "Volume Vacuum" });
		expect(body.workerForm.sections[0].fields[0].name).toBe("garbage_threshold");
		expect(typeof body.worker.garbage_threshold).toBe("number");
		expect(body.runtime.detectionIntervalMinutes).toBeGreaterThan(0);
	});

	test("explains job types no worker has registered", async () => {
		const { status, body } = await h.json("GET", "/maintenance/job-types/unknown_type");
		expect(status).toBe(404);
		expect(body.error).toBe(
			'No worker has registered the job type "unknown_type". Start a worker that supports it.',
		);
	});

	test("other descriptor failures pass through", async () => {
		h.admin.on("GET /api/plugin/job-types/broken/descriptor", () =>
			Response.json({ error: "disk full" }, { status: 500 }),
		);
		h.admin.on("GET /api/plugin/job-types/broken/config", {});
		const { status, body } = await h.json("GET", "/maintenance/job-types/broken");
		expect(status).toBe(500);
		expect(body.error).toBe("disk full");
	});

	test("rejects malformed job type names", async () => {
		expect((await h.get("/maintenance/job-types/Bad-Name")).status).toBe(400);
	});

	test("saves edits as a full protojson config", async () => {
		let saved: Record<string, unknown> = {};
		h.admin.on("PUT /api/plugin/job-types/vacuum/config", async (request: Request) => {
			saved = (await request.json()) as Record<string, unknown>;
			return Response.json({ ...saved, updated_by: "admin", updated_at: "2026-11-04T14:00:00Z" });
		});
		const { status, body } = await h.json("PUT", "/maintenance/job-types/vacuum/config", {
			worker: { garbage_threshold: 0.4 },
			runtime: { detectionIntervalMinutes: 25 },
		});
		expect(status).toBe(200);
		expect(saved).toMatchObject({
			job_type: "vacuum",
			worker_config_values: { garbage_threshold: { double_value: 0.4 } },
			admin_runtime: { detection_interval_minutes: 25 },
		});
		expect(body).toMatchObject({ worker: { garbage_threshold: 0.4 }, updatedBy: "admin" });
	});

	test("invalid edits never reach SeaweedFS", async () => {
		const { status, body } = await h.json("PUT", "/maintenance/job-types/vacuum/config", {
			worker: { garbage_threshold: 3 },
		});
		expect(status).toBe(400);
		expect(body.error).toContain("at most 1");
		expect(h.admin.requests.some((r) => r.method === "PUT")).toBe(false);
		expect(
			(await h.json("PUT", "/maintenance/job-types/vacuum/config", { worker: { x: { a: 1 } } })).status,
		).toBe(400);
	});

	test("viewers cannot change settings", async () => {
		const viewer = await harness({ role: "viewer" });
		const response = await viewer.request("PUT", "/maintenance/job-types/vacuum/config", { worker: {} });
		expect(response.status).toBe(403);
		await viewer.stop();
	});

	test("refreshes the form from a worker", async () => {
		h.admin.fixture("POST /api/plugin/job-types/vacuum/schema", "admin/plugin-vacuum-descriptor");
		const { body } = await h.json("POST", "/maintenance/job-types/vacuum/refresh");
		expect(h.admin.requests.find((r) => r.path.endsWith("/schema"))?.query).toEqual({
			force_refresh: "true",
		});
		expect(body.jobType).toBe("vacuum");
	});

	test("run history is newest first across successes and failures", async () => {
		h.admin.on("GET /api/plugin/job-types/vacuum/runs", {
			successful_runs: [{ run_id: "a", outcome: "success", completed_at: "2026-11-04T10:00:00Z" }],
			error_runs: [{ run_id: "b", outcome: "error", completed_at: "2026-11-04T11:00:00Z" }, { run_id: "c" }],
		});
		const { body } = await h.json("GET", "/maintenance/job-types/vacuum/runs");
		expect(body.runs.map((r: { runId: string }) => r.runId)).toEqual(["b", "a", "c"]);
	});

	test("detect returns proposals and the detector's reasoning", async () => {
		h.admin.fixture("POST /api/plugin/job-types/vacuum/detect", "admin/plugin-vacuum-detect");
		const { body } = await h.json("POST", "/maintenance/job-types/vacuum/detect");
		expect(JSON.parse(h.admin.requests.at(-1)?.body ?? "{}")).toEqual({ timeout_seconds: 120 });
		expect(body.totalProposals).toBeGreaterThan(0);
		expect(body.proposals[0]).toMatchObject({ priority: "high" });
		expect(body.activities.length).toBeGreaterThan(0);
	});

	test("run reports what was detected and executed", async () => {
		h.admin.fixture("POST /api/plugin/job-types/vacuum/run", "admin/plugin-vacuum-run");
		const { body } = await h.json("POST", "/maintenance/job-types/vacuum/run");
		expect(JSON.parse(h.admin.requests.at(-1)?.body ?? "{}")).toEqual({ timeout_seconds: 240 });
		expect(body).toMatchObject({ failed: 0, canceled: 0, skippedActive: 0 });
		expect(body.succeeded).toBe(body.executed);
	});
});
