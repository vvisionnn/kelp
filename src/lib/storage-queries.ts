import type { GrowVolumesInput, StorageInventory, StorageVolume } from "@shared/storage.ts";
import { queryOptions } from "@tanstack/react-query";
import { api } from "./api.ts";

export const storageKey = ["storage"] as const;

export const storageQueries = {
	inventory: () =>
		queryOptions({
			queryKey: storageKey,
			queryFn: () => api.get<StorageInventory>("/storage"),
			refetchInterval: 15_000,
		}),
};

export const storageApi = {
	vacuumVolume: (id: number, server: string) => api.post(`/storage/volumes/${id}/vacuum`, { server }),
	setReadOnly: (id: number, server: string, readOnly: boolean) =>
		api.post(`/storage/volumes/${id}/read-only`, { server, readOnly }),
	vacuumCluster: (garbageThreshold: number) => api.post("/storage/vacuum", { garbageThreshold }),
	grow: (input: GrowVolumesInput) => api.post<{ count: number }>("/storage/grow", input),
	deleteCollection: (name: string) => api.delete(`/storage/collections/${encodeURIComponent(name)}`),
};

/** Garbage share at which a volume is worth vacuuming; matches SeaweedFS's default threshold. */
export const VACUUM_THRESHOLD = 0.3;

/** URL segment for the default (unnamed) collection, which has no name to put in a path. */
export const DEFAULT_COLLECTION = "(default)";

export const collectionParam = (name: string) => name || DEFAULT_COLLECTION;
export const collectionFromParam = (param: string) => (param === DEFAULT_COLLECTION ? "" : param);
export const collectionLabel = (name: string) => name || "Default";

export type VolumeHealth = { tone: "good" | "warn" | "bad" | "idle"; label: string };

/** The single most important thing to know about a volume, worst first. */
export function volumeHealth(volume: StorageVolume): VolumeHealth {
	if (volume.replicas.length < volume.expectedReplicas) {
		return { tone: "bad", label: `${volume.replicas.length} of ${volume.expectedReplicas} copies` };
	}
	if (volume.readOnly) return { tone: "idle", label: "Read-only" };
	if (volume.garbageRatio >= VACUUM_THRESHOLD) return { tone: "warn", label: "Needs vacuum" };
	return { tone: "good", label: "Writable" };
}

/** Stable color slot per server, assigned in name order so a server keeps its color everywhere. */
export function serverPalette(servers: string[]): Map<string, number> {
	return new Map(
		[...new Set(servers)].sort((a, b) => a.localeCompare(b)).map((server, index) => [server, index]),
	);
}
