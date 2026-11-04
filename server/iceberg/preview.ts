import { parquetMetadataAsync, parquetReadObjects } from "hyparquet";
import { compressors } from "hyparquet-compressors";
import type { DataFileInfo, IcebergTable, TablePreview } from "../../shared/tables.ts";
import { obj, type Raw, str } from "../map/raw.ts";
import { readAvro } from "./avro.ts";
import { filerPathForLocation } from "./metadata.ts";

/** Reads files from the filer: whole, or a byte range. */
export interface FileReader {
	read(path: string, range?: { start: number; end: number }): Promise<Uint8Array>;
}

const MAX_FILES = 500;
const MAX_CELL = 200;

/** Renders any decoded Parquet value as display text. */
export function cell(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? "Invalid date" : value.toISOString();
	if (typeof value === "bigint") return value.toString();
	if (value instanceof Uint8Array) {
		const hex = Buffer.from(value.subarray(0, 32)).toString("hex");
		return `0x${hex}${value.length > 32 ? "…" : ""}`;
	}
	const text =
		typeof value === "object"
			? JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v))
			: String(value);
	return text.length > MAX_CELL ? `${text.slice(0, MAX_CELL)}…` : text;
}

function partitionValues(partition: unknown): Record<string, string | null> {
	return Object.fromEntries(Object.entries(obj(partition)).map(([key, value]) => [key, cell(value)]));
}

/** Path of a file location on the filer; throws a readable error for foreign locations. */
function pathOf(location: string): string {
	const path = filerPathForLocation(location);
	if (!path) throw new Error(`Kelp can only read files stored in SeaweedFS, not ${location}`);
	return path;
}

/**
 * Lists a snapshot's live data files from its manifest list and manifests, then reads the first
 * rows of one Parquet file with ranged reads (only the footer and the needed pages are fetched).
 */
export async function previewTable(
	reader: FileReader,
	table: IcebergTable,
	options: { snapshotId?: string | undefined; file?: string | undefined; limit: number },
): Promise<TablePreview> {
	const snapshotId = options.snapshotId ?? table.currentSnapshotId;
	const snapshot = table.snapshots.find((s) => s.id === snapshotId);
	const empty: TablePreview = {
		snapshotId: snapshot?.id ?? null,
		files: [],
		file: null,
		columns: table.fields.map((f) => f.name),
		rows: [],
		hasDeletes: false,
		notes: [],
	};
	if (!snapshot) {
		return {
			...empty,
			notes: [
				snapshotId ? `Snapshot ${snapshotId} is not part of this table.` : "This table has no data yet.",
			],
		};
	}
	if (!snapshot.manifestList) return { ...empty, notes: ["This snapshot has no manifest list."] };

	const manifests = (await readAvro<Raw>(await reader.read(pathOf(snapshot.manifestList)))).records;
	const hasDeletes = manifests.some((m) => Number(m.content) === 1);
	const files: DataFileInfo[] = [];
	for (const manifest of manifests) {
		if (Number(manifest.content) !== 0 || files.length >= MAX_FILES) continue;
		const entries = (await readAvro<Raw>(await reader.read(pathOf(str(manifest.manifest_path))))).records;
		for (const entry of entries) {
			const dataFile = obj(entry.data_file);
			// Status 2 marks files removed by this snapshot; content 0 is data (1 and 2 are deletes).
			if (Number(entry.status) === 2 || Number(dataFile.content ?? 0) !== 0) continue;
			files.push({
				path: str(dataFile.file_path),
				format: str(dataFile.file_format, "PARQUET").toUpperCase(),
				records: Number(dataFile.record_count ?? 0),
				size: Number(dataFile.file_size_in_bytes ?? 0),
				partition: partitionValues(dataFile.partition),
			});
			if (files.length >= MAX_FILES) break;
		}
	}

	const notes: string[] = [];
	if (hasDeletes) notes.push("This snapshot has delete files. Rows deleted by them may still appear here.");
	if (files.length >= MAX_FILES) notes.push(`Showing the first ${MAX_FILES} data files.`);
	const result = { ...empty, snapshotId: snapshot.id, files, hasDeletes, notes };

	const chosen = options.file
		? files.find((f) => f.path === options.file)
		: files.find((f) => f.format === "PARQUET");
	if (!chosen) {
		if (options.file) notes.push("That file is not part of this snapshot.");
		else if (files.length) notes.push("Kelp previews Parquet files; this snapshot has none.");
		return result;
	}
	if (chosen.format !== "PARQUET") {
		notes.push(`Kelp previews Parquet files; ${chosen.format} files cannot be shown.`);
		return { ...result, file: chosen.path };
	}

	const path = pathOf(chosen.path);
	const size = chosen.size || (await reader.read(path)).length;
	const file = {
		byteLength: size,
		slice: async (start: number, end?: number) => {
			const bytes = await reader.read(path, { start, end: (end ?? size) - 1 });
			return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
		},
	};
	const metadata = await parquetMetadataAsync(file);
	const columns = metadata.schema
		.slice(1)
		.filter((e) => !e.num_children)
		.map((e) => e.name);
	const rows = await parquetReadObjects({ file, metadata, rowStart: 0, rowEnd: options.limit, compressors });
	return {
		...result,
		file: chosen.path,
		columns,
		rows: rows.map((row) => columns.map((column) => cell((row as Record<string, unknown>)[column]))),
	};
}
