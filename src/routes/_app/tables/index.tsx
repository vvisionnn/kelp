import type { TableBucket } from "@shared/tables.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Database, ScrollText, Table2 } from "lucide-react";
import { motion } from "motion/react";
import { CopyButton } from "@/components/kelp/copy-button.tsx";
import { usePrefersReducedMotion } from "@/components/kelp/motion.ts";
import { EmptyState, ErrorState, PageHeader, Reveal, SkeletonBlock } from "@/components/kelp/page.tsx";
import { CreateBucketDialog } from "@/components/kelp/tables/create-dialogs.tsx";
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

function TablesPage() {
	const { data, isPending, error, refetch } = useQuery(streamsQueries.tableBuckets());
	const canWrite = useCanWrite();
	return (
		<>
			<PageHeader
				title="Tables"
				description="Iceberg tables in SeaweedFS table buckets, and how query engines connect to them."
				actions={canWrite ? <CreateBucketDialog /> : null}
			/>
			{isPending ? (
				<div
					className="grid gap-3 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]"
					role="status"
					aria-label="Loading table buckets"
				>
					<SkeletonBlock className="h-48 rounded-xl" />
					<SkeletonBlock className="h-80 rounded-xl" />
				</div>
			) : error ? (
				<ErrorState error={error} onRetry={() => refetch()} />
			) : data.buckets.length === 0 ? (
				<EmptyState
					icon={<Database />}
					title="No table buckets yet"
					description="Create a table bucket to give engines like Spark, Trino or DuckDB an Iceberg warehouse on SeaweedFS."
				/>
			) : (
				<Reveal className="grid gap-3 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
					<section aria-label="Table buckets" className="group-sheet h-fit divide-y divide-border">
						{data.buckets.map((bucket, index) => (
							<BucketRow key={bucket.arn} bucket={bucket} index={index} />
						))}
					</section>
					<ConnectCard port={data.icebergPort} example={data.buckets[0]?.name ?? "analytics"} />
				</Reveal>
			)}
		</>
	);
}

function BucketRow({ bucket, index }: { bucket: TableBucket; index: number }) {
	const reduced = usePrefersReducedMotion();
	return (
		<motion.div
			initial={reduced ? false : { opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 0.2, delay: reduced ? 0 : index * 0.03 }}
		>
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
		</motion.div>
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
