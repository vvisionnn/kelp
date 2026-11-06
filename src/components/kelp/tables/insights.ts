import type { DataFileInfo, IcebergSnapshot, TableNamespace, TableSummary } from "@shared/tables.ts";
import { formatBytes, formatCount } from "@/lib/format.ts";

/** Where engines reach the Iceberg REST catalog: the S3 host on the catalog port. */
export function catalogUri(
	s3Endpoint: string | null | undefined,
	port: number | null,
	fallbackHost: string,
): string {
	let protocol = "http:";
	let host = fallbackHost;
	if (s3Endpoint) {
		try {
			const url = new URL(s3Endpoint);
			protocol = url.protocol;
			host = url.hostname;
		} catch {
			// Not a URL; keep the fallback.
		}
	}
	return `${protocol}//${host}:${port ?? 8181}`;
}

/** Namespaces with their tables, including namespaces that have none yet. */
export function groupTables(namespaces: TableNamespace[], tables: TableSummary[]) {
	const groups = new Map<string, TableSummary[]>(namespaces.map((ns) => [ns.name, []]));
	for (const table of tables) groups.set(table.namespace, [...(groups.get(table.namespace) ?? []), table]);
	return [...groups]
		.map(([namespace, items]) => ({ namespace, tables: items.sort((a, b) => a.name.localeCompare(b.name)) }))
		.sort((a, b) => a.namespace.localeCompare(b.namespace));
}

/** Records and bytes per partition value, largest first, from a snapshot's data files. */
export function recordsByPartition(files: DataFileInfo[]) {
	const groups = new Map<string, { records: number; bytes: number }>();
	for (const file of files) {
		const key =
			Object.entries(file.partition)
				.map(([name, value]) => `${name}=${value ?? "null"}`)
				.join(", ") || "unpartitioned";
		const current = groups.get(key) ?? { records: 0, bytes: 0 };
		groups.set(key, { records: current.records + file.records, bytes: current.bytes + file.size });
	}
	return [...groups].map(([partition, v]) => ({ partition, ...v })).sort((a, b) => b.records - a.records);
}

const SUMMARY_LABELS: Array<[string, string, (v: number) => string]> = [
	["added-records", "rows added", formatCount],
	["deleted-records", "rows deleted", formatCount],
	["added-data-files", "files added", formatCount],
	["deleted-data-files", "files removed", formatCount],
	["added-files-size", "written", formatBytes],
];

/** The headline numbers of a snapshot summary, skipping zeros. */
export function snapshotHighlights(snapshot: IcebergSnapshot): string[] {
	return SUMMARY_LABELS.flatMap(([key, label, format]) => {
		const value = Number(snapshot.summary[key] ?? 0);
		return value > 0 ? [`${format(value)} ${label}`] : [];
	});
}
