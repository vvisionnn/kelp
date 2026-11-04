import type {
	ClusterNode,
	MasterNode,
	MountClient,
	Overview,
	TopologyDataCenter,
	VolumeServer,
} from "@shared/api.ts";
import { queryOptions } from "@tanstack/react-query";
import { api } from "./api.ts";

const LIVE = 15_000;

/** Query definitions shared by route loaders and components. */
export const queries = {
	overview: () =>
		queryOptions({
			queryKey: ["overview"],
			queryFn: () => api.get<Overview>("/overview"),
			refetchInterval: LIVE,
		}),
	masters: () =>
		queryOptions({
			queryKey: ["cluster", "masters"],
			queryFn: () =>
				api.get<{ masters: MasterNode[]; leader: string; maxVolumeId: number }>("/cluster/masters"),
			refetchInterval: LIVE,
		}),
	volumeServers: () =>
		queryOptions({
			queryKey: ["cluster", "volume-servers"],
			queryFn: async () =>
				(await api.get<{ volumeServers: VolumeServer[] }>("/cluster/volume-servers")).volumeServers,
			refetchInterval: LIVE,
		}),
	nodes: (type: "filers" | "s3" | "brokers") =>
		queryOptions({
			queryKey: ["cluster", type],
			queryFn: async () => (await api.get<{ nodes: ClusterNode[] }>(`/cluster/${type}`)).nodes,
			refetchInterval: LIVE,
		}),
	mountClients: () =>
		queryOptions({
			queryKey: ["cluster", "mount-clients"],
			queryFn: async () => (await api.get<{ clients: MountClient[] }>("/cluster/mount-clients")).clients,
			refetchInterval: LIVE,
		}),
	topology: () =>
		queryOptions({
			queryKey: ["cluster", "topology"],
			queryFn: async () =>
				(await api.get<{ dataCenters: TopologyDataCenter[] }>("/cluster/topology")).dataCenters,
			refetchInterval: LIVE,
		}),
};
