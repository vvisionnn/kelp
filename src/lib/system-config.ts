import { queryOptions } from "@tanstack/react-query";
import { api } from "./api.ts";

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

/**
 * `/system/config`, cached whole under one key. Pages that need a part of it take it with
 * `select`; a query that cached only a part under this key would hand that part to every other
 * page (Files cached the endpoint string, and Tables then crashed reading `.kelp` from it).
 */
export const systemConfigQuery = () =>
	queryOptions({
		queryKey: ["system", "config"],
		queryFn: () => api.get<SystemConfig>("/system/config"),
	});

/** Where S3 clients connect, or null when Kelp has no public endpoint configured. */
export const s3EndpointQuery = () =>
	queryOptions({
		...systemConfigQuery(),
		select: (config: SystemConfig) => config.kelp.s3Endpoint,
		staleTime: 5 * 60_000,
	});
