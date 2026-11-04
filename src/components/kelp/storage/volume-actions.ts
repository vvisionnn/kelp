import type { StorageVolume } from "@shared/storage.ts";
import { useAction } from "@/lib/mutations.ts";
import { storageApi, storageKey } from "@/lib/storage-queries.ts";

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/** Names one or many volumes the way a toast should: "Volume 3" or "4 volumes". */
export function volumesLabel(volumes: Array<Pick<StorageVolume, "id">>): string {
	return volumes.length === 1 ? `Volume ${volumes[0]?.id}` : plural(volumes.length, "volume");
}

/** Vacuum and read-only toggles for one or many volumes, applied to every replica. */
export function useVolumeActions() {
	const vacuum = useAction({
		run: async (volumes: StorageVolume[]) => {
			for (const volume of volumes) {
				const server = volume.replicas[0]?.server;
				if (server) await storageApi.vacuumVolume(volume.id, server);
			}
		},
		success: (_, volumes) => `${volumesLabel(volumes)} vacuumed`,
		invalidate: [storageKey],
	});
	const setReadOnly = useAction({
		run: async ({ volumes, readOnly }: { volumes: StorageVolume[]; readOnly: boolean }) => {
			for (const volume of volumes) {
				for (const replica of volume.replicas) {
					await storageApi.setReadOnly(volume.id, replica.server, readOnly);
				}
			}
		},
		success: (_, { volumes, readOnly }) =>
			`${volumesLabel(volumes)} ${volumes.length === 1 ? "is" : "are"} now ${readOnly ? "read-only" : "writable"}`,
		invalidate: [storageKey],
	});
	return { vacuum, setReadOnly };
}
