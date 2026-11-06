import type { TableBucket } from "@shared/tables.ts";
import { useQueries, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Database, ScrollText, Table2 } from "lucide-react";
import { CopyButton } from "@/components/kelp/copy-button.tsx";
import { EmptyState, PageHeader, SkeletonBlock } from "@/components/kelp/page.tsx";
import { ListGhost, LoadingRegion } from "@/components/kelp/skeletons.tsx";
import { CreateBucketDialog } from "@/components/kelp/tables/create-dialogs.tsx";
import { catalogUri } from "@/components/kelp/tables/insights.ts";
import { DashboardGhost, WarehouseDashboard } from "@/components/kelp/tables/table-insights.tsx";
import { Loaded, Swap } from "@/components/kelp/transitions.tsx";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format.ts";
import { useCanWrite } from "@/lib/session.ts";
import { streamsQueries } from "@/lib/streams-queries.ts";

export const Route = createFileRoute("/_app/tables/")({
	staticData: { section: "Object store", title: "Tables" },
	loader: ({ context }) => {
		// Prefetch without blocking: the page renders at once and its skeleton gives way to data.
		void context.queryClient.prefetchQuery(streamsQueries.tableBuckets());
	},
	component: TablesPage,
});

function TablesPage() {
	const query = useQuery(streamsQueries.tableBuckets());
	const canWrite = useCanWrite();
	return (
		<>
			<PageHeader
				title="Tables"
				description="Iceberg tables in SeaweedFS table buckets, and how query engines connect to them."
				actions={canWrite ? <CreateBucketDialog /> : null}
			/>
			<Loaded query={query} skeleton={<TablesSkeleton />}>
				{(data) => (
					<Swap id={data.buckets.length === 0 ? "empty" : "list"}>
						{data.buckets.length === 0 ? (
							<EmptyState
								icon={<Database />}
								title="No table buckets yet"
								description="Create a table bucket to give engines like Spark, Trino or DuckDB an Iceberg warehouse on SeaweedFS."
							/>
						) : (
							<>
								<TablesOverview buckets={data.buckets} />
								<div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
									<section aria-label="Table buckets" className="group-sheet h-fit divide-y divide-border">
										{data.buckets.map((bucket) => (
											<BucketRow key={bucket.arn} bucket={bucket} />
										))}
									</section>
									<ConnectCard port={data.icebergPort} example={data.buckets[0]?.name ?? "analytics"} />
								</div>
							</>
						)}
					</Swap>
				)}
			</Loaded>
		</>
	);
}

/** Every warehouse's namespaces and tables, totalled across the cluster. */
function TablesOverview({ buckets }: { buckets: TableBucket[] }) {
	const details = useQueries({ queries: buckets.map((b) => streamsQueries.tableBucket(b.name)) });
	const loaded = details.flatMap((q) => (q.data ? [q.data] : []));
	const tables = loaded.flatMap((d) => d.tables.map((table) => ({ bucket: d.bucket.name, table })));
	return (
		<WarehouseDashboard
			warehouses={buckets.length}
			namespaces={loaded.reduce((sum, d) => sum + d.namespaces.length, 0)}
			tables={tables}
			pending={details.some((q) => q.isPending)}
		/>
	);
}

function BucketRow({ bucket }: { bucket: TableBucket }) {
	return (
		<Link
			to="/tables/$bucket"
			params={{ bucket: bucket.name }}
			className="group flex items-center gap-3 px-4 py-3 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-raised/70"
		>
			<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-raised text-muted-foreground">
				<Table2 className="size-4" />
			</span>
			<span className="min-w-0 flex-1">
				<span className="block truncate font-medium font-mono text-[13px]">{bucket.name}</span>
				<span className="block text-[12px] text-muted-foreground">
					{bucket.format.toLowerCase()} warehouse, owned by {bucket.owner || "admin"}, created{" "}
					{formatDateTime(bucket.createdAt)}
				</span>
			</span>
			{bucket.policyStatements > 0 && (
				<Badge variant="secondary">
					<ScrollText />
					{bucket.policyStatements} policy {bucket.policyStatements === 1 ? "rule" : "rules"}
				</Badge>
			)}
			<ChevronRight className="size-4 text-tertiary transition-transform group-hover:translate-x-0.5" />
		</Link>
	);
}

function ConnectCard({ port, example }: { port: number | null; example: string }) {
	const { data } = useQuery(streamsQueries.kelpEndpoints());
	const uri = catalogUri(data?.kelp.s3Endpoint, port, window.location.hostname);
	const pyiceberg = [
		"from pyiceberg.catalog import load_catalog",
		"",
		"catalog = load_catalog(",
		'    "seaweedfs",',
		`    uri="${uri}",`,
		`    warehouse="s3://${example}",`,
		'    credential="<access-key>:<secret-key>",',
		")",
	].join("\n");
	return (
		<section className="group-sheet h-fit p-4">
			<h2 className="font-semibold text-[13px]">Connect a query engine</h2>
			<p className="mt-0.5 text-[12px] text-muted-foreground">
				Any Iceberg REST client works. Sign in with an S3 access key as OAuth client credentials.
			</p>
			<dl className="mt-8 grid gap-4 text-sm">
				<div>
					<dt className="text-[13px] text-foreground/65">Catalog URI</dt>
					<dd className="mt-1 flex items-center gap-1 break-all font-mono text-[15px]">
						{uri}
						<CopyButton value={uri} label="Copy catalog URI" />
					</dd>
				</div>
				<div>
					<dt className="text-[12px] text-muted-foreground">Warehouse</dt>
					<dd className="mt-0.5 font-mono text-[13px]">s3://&lt;table-bucket&gt;</dd>
				</div>
			</dl>
			<div className="relative mt-4">
				<pre className="overflow-x-auto rounded-lg bg-raised p-3.5 pr-10 font-mono text-[12px] leading-relaxed">
					{pyiceberg}
				</pre>
				<span className="absolute top-2 right-2">
					<CopyButton value={pyiceberg} label="Copy PyIceberg example" />
				</span>
			</div>
		</section>
	);
}

function TablesSkeleton() {
	return (
		<LoadingRegion label="Loading table buckets">
			<DashboardGhost wide />
			<div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
				<ListGhost rows={2} className="h-fit" />
				<section className="group-sheet h-fit p-4">
					<h2 className="font-semibold text-[13px]">Connect a query engine</h2>
					<p className="mt-0.5 text-[12px] text-muted-foreground">
						Any Iceberg REST client works. Sign in with an S3 access key as OAuth client credentials.
					</p>
					<SkeletonBlock className="mt-8 h-[92px]" />
					<SkeletonBlock className="mt-4 h-48 rounded-lg" />
				</section>
			</div>
		</LoadingRegion>
	);
}
