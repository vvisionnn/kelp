import type { TableBucket } from "@shared/tables.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Database, ScrollText, Table2 } from "lucide-react";
import { motion } from "motion/react";
import { CopyButton } from "@/components/kelp/copy-button.tsx";
import { usePrefersReducedMotion } from "@/components/kelp/motion.ts";
import {
	AuroraCard,
	EmptyState,
	ErrorState,
	PageHeader,
	Reveal,
	SkeletonBlock,
} from "@/components/kelp/page.tsx";
import { CreateBucketDialog } from "@/components/kelp/tables/create-dialogs.tsx";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format.ts";
import { useCanWrite } from "@/lib/session.ts";
import { streamsQueries } from "@/lib/streams-queries.ts";
import { cn } from "@/lib/utils";

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
					className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]"
					role="status"
					aria-label="Loading table buckets"
				>
					<div className="grid gap-4 sm:grid-cols-2">
						<SkeletonBlock className="h-56 rounded-lg" />
						<SkeletonBlock className="h-56 rounded-lg" />
					</div>
					<SkeletonBlock className="h-96 rounded-2xl" />
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
				<Reveal className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
					<section
						aria-label="Table buckets"
						className={cn("grid content-start gap-4", data.buckets.length > 1 && "sm:grid-cols-2")}
					>
						{data.buckets.map((bucket, index) => (
							<BucketCard key={bucket.arn} bucket={bucket} index={index} />
						))}
					</section>
					<ConnectCard port={data.icebergPort} example={data.buckets[0]?.name ?? "analytics"} />
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
				className="group flex h-full min-h-56 flex-col rounded-lg bg-card p-6 transition-colors hover:bg-raised"
			>
				<div className="flex items-start justify-between gap-3">
					<span className="flex size-10 items-center justify-center rounded-md bg-area/15 text-area">
						<Table2 className="size-5" />
					</span>
					<ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
				</div>
				<span className="mt-8 block truncate font-mono text-xl tracking-tight">{bucket.name}</span>
				<span className="mt-1 text-[13px] text-muted-foreground">
					{bucket.format.toLowerCase()} warehouse
				</span>
				<div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-6 text-[13px] text-muted-foreground">
					<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
						<dt>Owner</dt>
						<dd className="text-foreground">{bucket.owner || "admin"}</dd>
						<dt>Created</dt>
						<dd className="text-foreground">{formatDateTime(bucket.createdAt)}</dd>
					</dl>
					{bucket.policyStatements > 0 && (
						<Badge variant="area">
							<ScrollText />
							{bucket.policyStatements} policy {bucket.policyStatements === 1 ? "rule" : "rules"}
						</Badge>
					)}
				</div>
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
		<AuroraCard className="p-7 sm:p-8">
			<h2 className="font-[450] text-2xl tracking-[-0.02em]">Connect a query engine</h2>
			<p className="mt-2 text-[15px] text-foreground/75">
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
					<dt className="text-[13px] text-foreground/65">Warehouse</dt>
					<dd className="mt-1 font-mono text-[15px]">s3://&lt;table-bucket&gt;</dd>
				</div>
			</dl>
			<div className="relative mt-6">
				<pre className="overflow-x-auto rounded-md bg-background/75 p-4 font-mono text-xs leading-relaxed backdrop-blur">
					{pyiceberg}
				</pre>
				<span className="absolute top-2 right-2">
					<CopyButton value={pyiceberg} label="Copy PyIceberg example" />
				</span>
			</div>
		</AuroraCard>
	);
}
