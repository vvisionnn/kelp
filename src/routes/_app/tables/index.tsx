import type { TableBucket } from "@shared/tables.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Database, ScrollText, Table2 } from "lucide-react";
import { motion } from "motion/react";
import { CopyButton } from "@/components/kelp/copy-button.tsx";
import { usePrefersReducedMotion } from "@/components/kelp/motion.ts";
import { EmptyState, ErrorState, PageHeader, Panel, Reveal, SkeletonBlock } from "@/components/kelp/page.tsx";
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
					className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
					role="status"
					aria-label="Loading table buckets"
				>
					{[0, 1, 2].map((i) => (
						<SkeletonBlock key={i} className="h-32 rounded-xl" />
					))}
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
				<Reveal className="space-y-6">
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
						{data.buckets.map((bucket, index) => (
							<BucketCard key={bucket.arn} bucket={bucket} index={index} />
						))}
					</div>
					<ConnectPanel port={data.icebergPort} example={data.buckets[0]?.name ?? "analytics"} />
				</Reveal>
			)}
		</>
	);
}

function BucketCard({ bucket, index }: { bucket: TableBucket; index: number }) {
	const reduced = usePrefersReducedMotion();
	return (
		<motion.div
			initial={reduced ? false : { opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.3, delay: reduced ? 0 : index * 0.05 }}
		>
			<Link
				to="/tables/$bucket"
				params={{ bucket: bucket.name }}
				className="group flex h-full flex-col gap-4 rounded-xl border bg-card p-5 transition-colors hover:border-primary/40"
			>
				<div className="flex items-start justify-between gap-3">
					<span className="flex items-center gap-3">
						<span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
							<Table2 className="size-4.5" />
						</span>
						<span>
							<span className="block font-medium font-mono">{bucket.name}</span>
							<span className="text-muted-foreground text-xs">{bucket.format.toLowerCase()} warehouse</span>
						</span>
					</span>
					<ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
				</div>
				<div className="mt-auto flex flex-wrap items-end justify-between gap-2 text-muted-foreground text-xs">
					<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
						<dt>Owner</dt>
						<dd className="text-foreground">{bucket.owner || "admin"}</dd>
						<dt>Created</dt>
						<dd className="text-foreground">{formatDateTime(bucket.createdAt)}</dd>
					</dl>
					{bucket.policyStatements > 0 && (
						<Badge variant="secondary">
							<ScrollText />
							{bucket.policyStatements} policy {bucket.policyStatements === 1 ? "rule" : "rules"}
						</Badge>
					)}
				</div>
			</Link>
		</motion.div>
	);
}

function ConnectPanel({ port, example }: { port: number | null; example: string }) {
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
		<Panel
			title="Connect a query engine"
			description="Any Iceberg REST client works. Sign in with an S3 access key as OAuth client credentials."
		>
			<dl className="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
				<dt className="text-muted-foreground">Catalog URI</dt>
				<dd className="flex items-center gap-1 font-mono">
					{uri}
					<CopyButton value={uri} label="Copy catalog URI" />
				</dd>
				<dt className="text-muted-foreground">Warehouse</dt>
				<dd className="font-mono">s3://&lt;table-bucket&gt;</dd>
			</dl>
			<div className="relative mt-4">
				<pre className="overflow-x-auto rounded-lg bg-muted p-4 font-mono text-xs leading-relaxed">
					{pyiceberg}
				</pre>
				<span className="absolute top-2 right-2">
					<CopyButton value={pyiceberg} label="Copy PyIceberg example" />
				</span>
			</div>
		</Panel>
	);
}
