import type { KelpSettings, MaintenanceOverview } from "@shared/maintenance.ts";
import {
	mapActivity,
	mapDetection,
	mapJob,
	mapJobDetail,
	mapJobTypeConfig,
	mapJobTypeSummaries,
	mapLane,
	mapRunHistory,
	mapRunResult,
	mapScheduler,
	mapWorker,
} from "../server/map/maintenance.ts";
import type { Raw } from "../server/map/raw.ts";
import { fixture } from "./render-app.tsx";

const admin = <T = Raw>(name: string) => fixture<T>(`admin/plugin-${name}`);

/** Maintenance API responses built from real SeaweedFS fixtures through the server's mappers. */
export async function maintenanceApi() {
	const [status, jobTypes, states, scheduler, lanes, workers] = await Promise.all([
		admin("status"),
		admin<Raw[]>("job-types"),
		admin<Raw[]>("scheduler-states"),
		admin("scheduler-status"),
		admin<Raw[]>("lanes"),
		admin<Raw[]>("workers"),
	]);
	const overview: MaintenanceOverview = {
		configured: Boolean(status.configured),
		enabled: Boolean(status.enabled),
		workerCount: workers.length,
		scheduler: mapScheduler(scheduler),
		lanes: lanes.map(mapLane),
		jobTypes: mapJobTypeSummaries(jobTypes, states, scheduler, workers),
		workers: workers.map(mapWorker),
	};
	const jobs = (await admin<Raw[]>("jobs")).map(mapJob);
	const vacuumJobs = (await admin<Raw[]>("jobs-vacuum")).map(mapJob);
	const activities = (await admin<Raw[]>("activities")).map(mapActivity);
	const vacuumConfig = mapJobTypeConfig(await admin("vacuum-descriptor"), await admin("vacuum-config"));
	const adminScriptConfig = mapJobTypeConfig(
		await admin("admin_script-descriptor"),
		await admin("admin_script-config"),
	);
	const detail = mapJobDetail(await admin("vacuum-job-detail"));
	const detection = mapDetection(await admin("vacuum-detect"));
	const runResult = mapRunResult(await admin("vacuum-run"));
	const runs = mapRunHistory(await admin("admin_script-runs"));
	const systemConfig = {
		masterAddress: "127.0.0.1:9333",
		dataDir: "/data/admin",
		maintenanceEnabled: true,
		maintenanceRunning: true,
		cacheExpiration: "10s",
		filerCacheExpiration: "30s",
		s3PublicEndpoint: "",
		kelp: { version: "1.2.3", s3Endpoint: null },
	};
	const kelpSettings: KelpSettings = {
		version: "1.2.3",
		upstreams: [
			{ label: "Admin API", url: "http://seaweedfs-admin:23646" },
			{ label: "Master", url: "http://seaweedfs:9333" },
		],
		s3Endpoint: "https://s3.example.com",
		sessionTtlHours: 12,
		viewerEnabled: false,
	};
	return {
		overview,
		jobs,
		vacuumJobs,
		activities,
		vacuumConfig,
		adminScriptConfig,
		detail,
		detection,
		runResult,
		runs,
		systemConfig,
		kelpSettings,
		routes: {
			"GET /maintenance/overview": overview,
			"GET /maintenance/jobs": { jobs },
			"GET /maintenance/activities": { activities },
			"GET /maintenance/job-types/vacuum": vacuumConfig,
			"GET /maintenance/job-types/admin_script": adminScriptConfig,
			"GET /maintenance/job-types/vacuum/runs": { runs },
			"GET /system/config": systemConfig,
			"GET /system/kelp": kelpSettings,
		} as Record<string, unknown>,
	};
}
