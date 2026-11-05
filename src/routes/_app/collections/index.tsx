import type { StorageCollection, StorageInventory } from "@shared/storage.ts";
import type { Telemetry } from "@shared/telemetry.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Layers } from "lucide-react";
import {
	BarList,
	compact,
	dataColor,
	Kpi,
	Ring,
	splitUnit,
	useRange,
} from "@/components/kelp/charts/index.ts";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import { EmptyState, PageHeader, Panel, Reveal } from "@/components/kelp/page.tsx";
import { GrowVolumesDialog } from "@/components/kelp/storage/cluster-actions.tsx";
import { HeroSkeleton } from "@/components/kelp/storage/common.tsx";
import { averageObject, collectionBars, collectionSlices } from "@/components/kelp/storage/insights.ts";
import { RangeControl, useTelemetry } from "@/components/kelp/storage/live.tsx";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatCount, formatPercent, ratio } from "@/lib/format.ts";
import { useCanWrite } from "@/lib/session.ts";
import { collectionLabel, collectionParam, storageQueries } from "@/lib/storage-queries.ts";

export const Route = createFileRoute("/_app/collections/")({
	staticData: { section: "Storage", title: "Collections" },
	loader: ({ context }) => void context.queryClient.prefetchQuery(storageQueries.inventory()),
	component: CollectionsPage,
});

export const collectionColumns: Array<Column<StorageCollection>> = [
	{
		accessorKey: "name",
		header: "Collection",
		cell: ({ row }) => (
			<Link
				to="/collections/$name"
				params={{ name: collectionParam(row.original.name) }}
				className={
					row.original.name ? "font-medium hover:underline" : "text-muted-foreground hover:underline"
				}
				onClick={(event) => event.stopPropagation()}
			>
				{collectionLabel(row.original.name)}
			</Link>
		),
	},
	{
		accessorKey: "size",
		header: "Size",
		cell: ({ row }) => <span className="tabular">{formatBytes(row.original.size)}</span>,
	},
	{
		accessorKey: "fileCount",
		header: "Files",
		cell: ({ row }) => <span className="tabular">{formatCount(row.original.fileCount)}</span>,
	},
	{
		accessorKey: "volumeCount",
		header: "Volumes",
		cell: ({ row }) => (
			<span className="tabular">
				{row.original.volumeCount}
				{row.original.ecVolumeCount > 0 && (
					<span className="text-muted-foreground"> + {row.original.ecVolumeCount} EC</span>
				)}
			</span>
		),
	},
	{
		id: "garbage",
		accessorFn: (c) => ratio(c.deletedBytes, c.size),
		header: "Garbage",
		cell: ({ row }) => (
			<span className="text-muted-foreground tabular">
				{row.original.deletedBytes > 0
					? formatPercent(ratio(row.original.deletedBytes, row.original.size))
					: "None"}
			</span>
		),
	},
	{
		id: "placement",
		header: "Placement",
		cell: ({ row }) => (
			<div className="flex flex-wrap items-center gap-1">
				{row.original.replications.map((r) => (
					<Badge key={r} variant="outline" className="font-mono">
						{r}
					</Badge>
				))}
				{row.original.diskTypes.map((d) => (
					<Badge key={d} variant="secondary">
						{d}
					</Badge>
				))}
				<span className="text-[12px] text-muted-foreground">
					{row.original.servers.length} {row.original.servers.length === 1 ? "server" : "servers"}
				</span>
			</div>
		),
		enableSorting: false,
	},
];

function CollectionsPage() {
	const canWrite = useCanWrite();
	const navigate = useNavigate();
	const [range, setRange] = useRange();
	const { data, isPending, error, refetch } = useQuery(storageQueries.inventory());
	const telemetry = useTelemetry(range);
	return (
		<>
			<PageHeader
				title="Collections"
				description="Groups of volumes sized, placed and deleted together. Every S3 bucket stores into its own."
				actions={
					<>
						<RangeControl telemetry={telemetry} range={range} onChange={setRange} />
						{canWrite && <GrowVolumesDialog inventory={data} />}
					</>
				}
			/>
			{data ? (
				<Reveal>
					<CollectionNumbers inventory={data} telemetry={telemetry} />
					{data.collections.length > 0 && <CollectionCharts collections={data.collections} />}
				</Reveal>
			) : (
				!error && <HeroSkeleton />
			)}
			<div className="mt-8">
				<DataTable
					data={data?.collections}
					columns={collectionColumns}
					getRowId={(c) => collectionParam(c.name)}
					isLoading={isPending}
					error={error}
					onRetry={() => refetch()}
					searchText={(c) => collectionLabel(c.name)}
					searchPlaceholder="Search collections"
					initialSorting={[{ id: "size", desc: true }]}
					onRowClick={(c) =>
						navigate({ to: "/collections/$name", params: { name: collectionParam(c.name) } })
					}
					empty={
						<EmptyState
							icon={<Layers />}
							title="No collections yet"
							description="A collection appears when its first volume is created, for example when you create a bucket."
						/>
					}
				/>
			</div>
		</>
	);
}

/** The collections at a glance, with stored-bytes growth when Kelp samples it. */
function CollectionNumbers({
	inventory,
	telemetry,
}: {
	inventory: StorageInventory;
	telemetry: Telemetry | undefined;
}) {
	const collections = inventory.collections;
	const total = collections.reduce((sum, c) => sum + c.size, 0);
	const files = collections.reduce((sum, c) => sum + c.fileCount, 0);
	const garbage = collections.reduce((sum, c) => sum + c.deletedBytes, 0);
	const largest = [...collections].sort((a, b) => b.size - a.size)[0];
	const growth = telemetry?.inventory ?? [];
	return (
		<div className="grid grid-cols-2 gap-3 max-sm:[&_section_svg]:hidden md:grid-cols-3 xl:grid-cols-6">
			<Kpi
				label="Collections"
				value={formatCount(collections.length)}
				hint={`${inventory.volumes.length} volumes in all`}
			/>
			<Kpi
				label="Stored"
				{...splitUnit(formatBytes(total))}
				hint="With erasure-coded data"
				trend={growth.map((p) => p.storedBytes)}
				color={dataColor(2)}
			/>
			<Kpi
				label="Files"
				value={compact(files)}
				hint={`${formatCount(files)} in all`}
				trend={growth.map((p) => p.files)}
			/>
			<Kpi
				label="Average object"
				{...splitUnit(formatBytes(files > 0 ? total / files : 0))}
				hint="Stored bytes per file"
			/>
			<Kpi
				label="Largest"
				value={largest ? formatPercent(ratio(largest.size, total)) : "–"}
				hint={largest ? `${collectionLabel(largest.name)} holds it` : "No data yet"}
			/>
			<Kpi
				label="Reclaimable"
				{...splitUnit(formatBytes(garbage))}
				hint={`${formatPercent(ratio(garbage, total))} of stored bytes`}
			/>
		</div>
	);
}

/** Bytes, files and object sizes compared across collections. */
function CollectionCharts({ collections }: { collections: StorageCollection[] }) {
	const total = collections.reduce((sum, c) => sum + c.size, 0);
	return (
		<div className="mt-3 grid gap-3 xl:grid-cols-12">
			<Panel
				title="Stored bytes"
				description="Share of the cluster by collection"
				className="min-w-0 xl:col-span-5"
			>
				<Ring
					label="Stored bytes by collection"
					size={152}
					thickness={14}
					slices={collectionSlices(collections)}
					center={
						<>
							<span className="font-rounded font-semibold text-[20px] leading-6">{formatBytes(total)}</span>
							<span className="text-[12px] text-muted-foreground">
								{formatCount(collections.length)} collections
							</span>
						</>
					}
				/>
			</Panel>
			<Panel title="Files" description="Objects stored, most first" className="min-w-0 xl:col-span-4">
				<BarList
					label="Files by collection"
					color={dataColor(2)}
					items={collectionBars(collections, (c) => c.fileCount, compact)}
				/>
			</Panel>
			<Panel title="Object size" description="Average bytes per file" className="min-w-0 xl:col-span-3">
				<BarList
					label="Average object size by collection"
					color={dataColor(3)}
					items={collectionBars(collections, averageObject, formatBytes)}
				/>
			</Panel>
		</div>
	);
}
