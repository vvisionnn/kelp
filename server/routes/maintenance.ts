import { Hono } from "hono";
import { z } from "zod";
import type { JobState, UpdateJobTypeConfig } from "../../shared/maintenance.ts";
import type { Env } from "../app.ts";
import {
	buildConfigUpdate,
	jobState,
	mapActivity,
	mapDetection,
	mapJob,
	mapJobDetail,
	mapJobTypeConfig,
	mapJobTypeSummaries,
	mapLane,
	mapObservation,
	mapRunHistory,
	mapRunResult,
	mapScheduler,
	mapWorker,
} from "../map/maintenance.ts";
import { list, obj, type Raw } from "../map/raw.ts";
import type { Services } from "../services.ts";
import { HttpUpstream, UpstreamError } from "../upstream/http.ts";

/** Kelp's HTTP server closes idle requests after 255 s; long admin calls must finish before that. */
const DETECT_TIMEOUT_SECONDS = 120;
const RUN_TIMEOUT_SECONDS = 240;

const jobTypeParam = z.string().regex(/^[a-z0-9_]{1,64}$/, "Unknown job type");
const jobIdParam = z.string().regex(/^[A-Za-z0-9_.:-]{1,200}$/, "Unknown job");
const STATES = [
	"pending",
	"assigned",
	"running",
	"succeeded",
	"failed",
	"canceled",
] as const satisfies JobState[];

const configValue = z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]);
const updateSchema = z.object({
	admin: z.record(z.string(), configValue).optional(),
	worker: z.record(z.string(), configValue).optional(),
	runtime: z.record(z.string(), z.union([z.number(), z.boolean()])).optional(),
});

export function maintenanceRoutes({ admin }: Services) {
	const slow = new HttpUpstream("admin", admin.url("").href, {
		timeoutMs: (RUN_TIMEOUT_SECONDS + 10) * 1000,
	});

	/** The job type's form descriptor; only exists once a worker has registered the type. */
	async function descriptor(jobType: string): Promise<Raw> {
		try {
			return obj(await admin.json<Raw>(`plugin/job-types/${jobType}/descriptor`));
		} catch (error) {
			if (error instanceof UpstreamError && error.status === 404) {
				throw new UpstreamError(
					"admin",
					404,
					`No worker has registered the job type "${jobType}". Start a worker that supports it.`,
				);
			}
			throw error;
		}
	}

	return new Hono<Env>()
		.get("/maintenance/overview", async (c) => {
			const [status, jobTypes, states, scheduler, lanes, workers] = await Promise.all([
				admin.json<Raw>("plugin/status"),
				admin.json<unknown>("plugin/job-types"),
				admin.json<unknown>("plugin/scheduler-states"),
				admin.json<Raw>("plugin/scheduler-status"),
				admin.json<unknown>("plugin/lanes"),
				admin.json<unknown>("plugin/workers"),
			]);
			const workerList = list(workers);
			return c.json({
				configured: Boolean(obj(status).configured),
				enabled: Boolean(obj(status).enabled),
				workerCount: workerList.length,
				scheduler: mapScheduler(obj(scheduler)),
				lanes: list(lanes).map(mapLane),
				jobTypes: mapJobTypeSummaries(list(jobTypes), list(states), obj(scheduler), workerList),
				workers: workerList.map(mapWorker),
			});
		})
		.get("/maintenance/jobs", async (c) => {
			const query = z
				.object({
					jobType: jobTypeParam.optional(),
					state: z.enum(STATES).optional(),
					limit: z.coerce.number().int().min(1).max(1000).default(200),
				})
				.parse(c.req.query());
			const raw = await admin.json<unknown>("plugin/jobs", {
				query: { job_type: query.jobType, limit: query.state ? 1000 : query.limit },
			});
			const jobs = list(raw)
				.filter((job) => !query.state || jobState(job.state) === query.state)
				.slice(0, query.limit)
				.map(mapJob);
			return c.json({ jobs });
		})
		.get("/maintenance/jobs/:jobId", async (c) => {
			const jobId = jobIdParam.parse(c.req.param("jobId"));
			const raw = await admin.json<Raw>(`plugin/jobs/${encodeURIComponent(jobId)}/detail`, {
				query: { activity_limit: 200, related_limit: 20 },
			});
			return c.json(mapJobDetail(obj(raw)));
		})
		.post("/maintenance/jobs/:jobId/expire", async (c) => {
			const jobId = jobIdParam.parse(c.req.param("jobId"));
			const { reason } = z
				.object({ reason: z.string().trim().max(500).default("") })
				.parse(await c.req.json().catch(() => ({})));
			const raw = obj(
				await admin.json<Raw>(`plugin/jobs/${encodeURIComponent(jobId)}/expire`, {
					method: "POST",
					body: { reason: reason || `Expired from Kelp by ${c.get("user").name}` },
				}),
			);
			return c.json({ expired: Boolean(raw.expired), job: raw.job ? mapJob(obj(raw.job)) : null });
		})
		.get("/maintenance/activities", async (c) => {
			const query = z
				.object({
					jobType: jobTypeParam.optional(),
					limit: z.coerce.number().int().min(1).max(500).default(100),
				})
				.parse(c.req.query());
			const raw = await admin.json<unknown>("plugin/activities", {
				query: { job_type: query.jobType, limit: query.limit },
			});
			return c.json({ activities: list(raw).map(mapActivity) });
		})
		.get("/maintenance/observations", async (c) => {
			const raw = await admin.json<unknown>("plugin/observations");
			return c.json({ observations: list(raw).map(mapObservation) });
		})
		.get("/maintenance/job-types/:jobType", async (c) => {
			const jobType = jobTypeParam.parse(c.req.param("jobType"));
			const [form, config] = await Promise.all([
				descriptor(jobType),
				admin.json<Raw>(`plugin/job-types/${jobType}/config`),
			]);
			return c.json(mapJobTypeConfig(form, obj(config)));
		})
		.post("/maintenance/job-types/:jobType/refresh", async (c) => {
			const jobType = jobTypeParam.parse(c.req.param("jobType"));
			const fresh = await slow.json<Raw>(`plugin/job-types/${jobType}/schema`, {
				method: "POST",
				query: { force_refresh: true },
			});
			const config = await admin.json<Raw>(`plugin/job-types/${jobType}/config`);
			return c.json(mapJobTypeConfig(obj(fresh), obj(config)));
		})
		.put("/maintenance/job-types/:jobType/config", async (c) => {
			const jobType = jobTypeParam.parse(c.req.param("jobType"));
			const update = updateSchema.parse(await c.req.json()) as UpdateJobTypeConfig;
			const [form, current] = await Promise.all([
				descriptor(jobType),
				admin.json<Raw>(`plugin/job-types/${jobType}/config`),
			]);
			const result = buildConfigUpdate(form, obj(current), update);
			if ("error" in result) return c.json({ error: result.error }, 400);
			const saved = await admin.json<Raw>(`plugin/job-types/${jobType}/config`, {
				method: "PUT",
				body: result.body,
			});
			return c.json(mapJobTypeConfig(form, obj(saved)));
		})
		.get("/maintenance/job-types/:jobType/runs", async (c) => {
			const jobType = jobTypeParam.parse(c.req.param("jobType"));
			const raw = await admin.json<Raw>(`plugin/job-types/${jobType}/runs`);
			return c.json({ runs: mapRunHistory(obj(raw)) });
		})
		.post("/maintenance/job-types/:jobType/detect", async (c) => {
			const jobType = jobTypeParam.parse(c.req.param("jobType"));
			const raw = await slow.json<Raw>(`plugin/job-types/${jobType}/detect`, {
				method: "POST",
				body: { timeout_seconds: DETECT_TIMEOUT_SECONDS },
			});
			return c.json(mapDetection(obj(raw)));
		})
		.post("/maintenance/job-types/:jobType/run", async (c) => {
			const jobType = jobTypeParam.parse(c.req.param("jobType"));
			const raw = await slow.json<Raw>(`plugin/job-types/${jobType}/run`, {
				method: "POST",
				body: { timeout_seconds: RUN_TIMEOUT_SECONDS },
			});
			return c.json(mapRunResult(obj(raw)));
		});
}
