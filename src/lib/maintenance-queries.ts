import type {
	DetectionResult,
	JobDetail,
	JobRun,
	JobState,
	JobTypeConfig,
	KelpSettings,
	MaintenanceActivity,
	MaintenanceJob,
	MaintenanceOverview,
	RunResult,
	UpdateJobTypeConfig,
} from "@shared/maintenance.ts";
import { queryOptions } from "@tanstack/react-query";
import { api } from "./api.ts";

/** Maintenance changes on a scale of seconds; keep it live without hammering the admin. */
const LIVE = 10_000;
const FEED = 5_000;

export interface SystemConfig {
	masterAddress: string;
	dataDir: string;
	maintenanceEnabled: boolean;
	maintenanceRunning: boolean;
	cacheExpiration: string;
	filerCacheExpiration: string;
	s3PublicEndpoint: string;
	kelp: { version: string; s3Endpoint: string | null };
}

export interface JobFilters {
	jobType?: string | undefined;
	state?: JobState | undefined;
	limit?: number;
}

export const maintenanceQueries = {
	overview: () =>
		queryOptions({
			queryKey: ["maintenance", "overview"],
			queryFn: () => api.get<MaintenanceOverview>("/maintenance/overview"),
			refetchInterval: LIVE,
		}),
	jobs: (filters: JobFilters = {}) =>
		queryOptions({
			queryKey: ["maintenance", "jobs", filters],
			queryFn: async () =>
				(
					await api.get<{ jobs: MaintenanceJob[] }>("/maintenance/jobs", {
						jobType: filters.jobType,
						state: filters.state,
						limit: filters.limit,
					})
				).jobs,
			refetchInterval: LIVE,
		}),
	job: (jobId: string) =>
		queryOptions({
			queryKey: ["maintenance", "jobs", "detail", jobId],
			queryFn: () => api.get<JobDetail>(`/maintenance/jobs/${encodeURIComponent(jobId)}`),
			refetchInterval: LIVE,
		}),
	activities: (jobType?: string) =>
		queryOptions({
			queryKey: ["maintenance", "activities", jobType ?? "all"],
			queryFn: async () =>
				(
					await api.get<{ activities: MaintenanceActivity[] }>("/maintenance/activities", {
						jobType,
						limit: 40,
					})
				).activities,
			refetchInterval: FEED,
		}),
	jobType: (jobType: string) =>
		queryOptions({
			queryKey: ["maintenance", "job-types", jobType],
			queryFn: () => api.get<JobTypeConfig>(`/maintenance/job-types/${jobType}`),
		}),
	runs: (jobType: string) =>
		queryOptions({
			queryKey: ["maintenance", "runs", jobType],
			queryFn: async () => (await api.get<{ runs: JobRun[] }>(`/maintenance/job-types/${jobType}/runs`)).runs,
			refetchInterval: LIVE,
		}),
	systemConfig: () =>
		queryOptions({
			queryKey: ["system", "config"],
			queryFn: () => api.get<SystemConfig>("/system/config"),
		}),
	kelpSettings: () =>
		queryOptions({
			queryKey: ["system", "kelp"],
			queryFn: () => api.get<KelpSettings>("/system/kelp"),
		}),
};

export const maintenanceApi = {
	saveConfig: (jobType: string, update: UpdateJobTypeConfig) =>
		api.put<JobTypeConfig>(`/maintenance/job-types/${jobType}/config`, update),
	refreshForm: (jobType: string) => api.post<JobTypeConfig>(`/maintenance/job-types/${jobType}/refresh`),
	detect: (jobType: string) => api.post<DetectionResult>(`/maintenance/job-types/${jobType}/detect`),
	run: (jobType: string) => api.post<RunResult>(`/maintenance/job-types/${jobType}/run`),
	expire: (jobId: string) =>
		api.post<{ expired: boolean; job: MaintenanceJob | null }>(
			`/maintenance/jobs/${encodeURIComponent(jobId)}/expire`,
			{},
		),
};
