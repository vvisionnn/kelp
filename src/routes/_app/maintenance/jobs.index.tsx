import type { JobState, MaintenanceJob } from "@shared/maintenance.ts";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ListChecks } from "lucide-react";
import { Kpi } from "@/components/kelp/charts/index.ts";
import { Segmented } from "@/components/kelp/controls.tsx";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import { lastDay, OutcomesChart, StackedGhost } from "@/components/kelp/maintenance/insights.tsx";
import {
	cellGhost,
	elapsed,
	formatDuration,
	humanize,
	JobStateBadge,
	JobTypeIcon,
	KPI_TILE,
	settled,
	twoLineGhost,
} from "@/components/kelp/maintenance/parts.tsx";
import { jobDuration, median, successRate } from "@/components/kelp/maintenance/stats.ts";
import { EmptyState, PageHeader, Panel, SkeletonBlock } from "@/components/kelp/page.tsx";
import { KpiGhost } from "@/components/kelp/skeletons.tsx";
import { TextMorph } from "@/components/kelp/text-morph.tsx";
import { Loaded } from "@/components/kelp/transitions.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatRelative } from "@/lib/format.ts";
import { maintenanceQueries } from "@/lib/maintenance-queries.ts";
import { oneOf, text } from "@/lib/search.ts";

const STATES = ["pending", "assigned", "running", "succeeded", "failed", "canceled"] as const;
const FILTERS: Array<{ value: "all" | JobState; label: string }> = [
	{ value: "all", label: "All" },
	{ value: "running", label: "Running" },
	{ value: "pending", label: "Queued" },
	{ value: "succeeded", label: "Succeeded" },
	{ value: "failed", label: "Failed" },
	{ value: "canceled", label: "Canceled" },
];

export const Route = createFileRoute("/_app/maintenance/jobs/")({
	staticData: { section: "Operations", title: "Maintenance jobs" },
	validateSearch: (raw: Record<string, unknown>): { jobType?: string; state?: (typeof STATES)[number] } => ({
		jobType: text(raw.jobType),
		state: oneOf(raw.state, STATES),
	}),
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) => void context.queryClient.prefetchQuery(maintenanceQueries.jobs(deps)),
	component: JobsPage,
});

function JobsPage() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	// A change of filter keeps the current rows on screen until the next set arrives.
	const jobs = useQuery({ ...maintenanceQueries.jobs(search), placeholderData: keepPreviousData });
	// The band counts every state for the chosen job type, whichever state is selected.
	const counted = useQuery({
		...maintenanceQueries.jobs(search.jobType ? { jobType: search.jobType } : {}),
		placeholderData: keepPreviousData,
	});
	const counts = (counted.data ?? []).reduce<Record<string, number>>((acc, job) => {
		acc[job.state] = (acc[job.state] ?? 0) + 1;
		return acc;
	}, {});
	const countOf = (value: "all" | JobState) =>
		value === "all" ? (counted.data?.length ?? 0) : (counts[value] ?? 0);
	const overview = useQuery(maintenanceQueries.overview());
	const names = Object.fromEntries((overview.data?.jobTypes ?? []).map((t) => [t.jobType, t.displayName]));
	const filtered = Boolean(search.jobType || search.state);
	const history = settled(
		useQuery({ ...maintenanceQueries.history(search.jobType), placeholderData: keepPreviousData }),
		{ jobs: [], activities: [] },
	);

	const columns: Array<Column<MaintenanceJob>> = [
		{
			accessorKey: "summary",
			header: "Job",
			cell: ({ row }) => (
				<div className="flex min-w-0 items-center gap-2.5">
					<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground [&_svg]:size-3.5">
						<JobTypeIcon jobType={row.original.jobType} />
					</span>
					<div className="min-w-0">
						<Link
							to="/maintenance/jobs/$jobId"
							params={{ jobId: row.original.id }}
							className="font-medium hover:text-primary"
						>
							{row.original.summary || humanize(row.original.jobType)}
						</Link>
						<p className="truncate text-[12px] text-muted-foreground">
							{names[row.original.jobType] ?? humanize(row.original.jobType)}
							{row.original.message && `: ${row.original.message}`}
						</p>
					</div>
				</div>
			),
			size: 380,
			meta: twoLineGhost,
		},
		{
			accessorKey: "state",
			header: "State",
			cell: ({ row }) => <JobStateBadge state={row.original.state} progress={row.original.progress} />,
			meta: cellGhost("w-20"),
		},
		{
			id: "duration",
			header: "Duration",
			cell: ({ row }) => (
				<span className="tabular">{elapsed(row.original.createdAt, row.original.completedAt)}</span>
			),
			meta: cellGhost("w-12"),
		},
		{
			accessorKey: "createdAt",
			header: "Created",
			cell: ({ row }) => (
				<span className="text-muted-foreground">{formatRelative(row.original.createdAt)}</span>
			),
			meta: cellGhost("w-16"),
		},
	];

	return (
		<>
			<PageHeader
				title="Maintenance jobs"
				description="Every job the scheduler queued, ran or gave up on, newest first."
				actions={
					<Select
						value={search.jobType ?? "all"}
						onValueChange={(value) =>
							navigate({
								search: (prev) => ({ ...prev, jobType: value === "all" ? undefined : String(value) }),
							})
						}
					>
						<SelectTrigger className="w-52" aria-label="Filter by job type">
							<SelectValue>
								{(value: string) => (value === "all" ? "All job types" : (names[value] ?? humanize(value)))}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All job types</SelectItem>
							{(overview.data?.jobTypes ?? []).map((type) => (
								<SelectItem key={type.jobType} value={type.jobType}>
									{type.displayName}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				}
			/>
			<div className="mb-6 grid gap-3 xl:grid-cols-12 [&>*]:min-w-0">
				<Panel
					title="Finished jobs"
					description="Per hour by outcome, last 24 hours"
					className="xl:col-span-8"
				>
					<Loaded query={history} skeleton={<StackedGhost height={160} />}>
						{(past) => <OutcomesChart buckets={lastDay(past.jobs, past.activities)} height={160} />}
					</Loaded>
				</Panel>
				<Loaded
					query={history}
					className="xl:col-span-4"
					skeleton={
						<div className="grid h-full grid-cols-2 gap-3 xl:grid-cols-1">
							<KpiGhost trend={false} className={KPI_TILE} />
							<KpiGhost trend={false} className={KPI_TILE} />
						</div>
					}
				>
					{(past) => <JobStats jobs={past.jobs} />}
				</Loaded>
			</div>
			<DataTable
				data={jobs.data}
				isLoading={jobs.isPending}
				error={jobs.error}
				onRetry={() => jobs.refetch()}
				getRowId={(job) => job.id}
				searchText={(job) => `${job.summary} ${job.message} ${job.id} ${job.workerId}`}
				searchPlaceholder="Search jobs"
				columns={columns}
				toolbar={
					<div className="-mx-1 w-full overflow-x-auto px-1 py-0.5 sm:w-auto">
						<Segmented
							// Natural width: the toolbar row scrolls on a phone rather than squeezing the segments.
							className="w-max max-w-none shrink-0"
							label="Filter by state"
							items={FILTERS.map((filter) => ({
								value: filter.value,
								label: (
									<span className="inline-flex items-center gap-1.5">
										{filter.label}
										{counted.data ? (
											<TextMorph className="text-muted-foreground tabular">
												{String(countOf(filter.value))}
											</TextMorph>
										) : (
											<SkeletonBlock className="h-3 w-3" />
										)}
									</span>
								),
							}))}
							value={search.state ?? "all"}
							onChange={(next) =>
								navigate({
									search: (prev) => ({
										...prev,
										state: next === "all" ? undefined : (next as (typeof STATES)[number]),
									}),
								})
							}
						/>
					</div>
				}
				empty={
					<EmptyState
						icon={<ListChecks />}
						title={filtered ? "No jobs match these filters" : "No jobs yet"}
						description={
							filtered
								? "Try another state or job type."
								: "Jobs appear here once the scheduler or someone in Kelp finds work."
						}
					/>
				}
			/>
		</>
	);
}

/** How the jobs in view have gone: their success rate and typical duration. */
function JobStats({ jobs }: { jobs: MaintenanceJob[] }) {
	const durations = jobs.map(jobDuration).filter((ms): ms is number => ms !== null);
	const typical = median(durations);
	const rate = successRate(jobs);
	return (
		<div className="grid h-full grid-cols-2 gap-3 xl:grid-cols-1">
			<Kpi
				label="Success rate"
				{...(rate === null ? { value: "–" } : { value: String(Math.round(rate * 100)), unit: "%" })}
				hint={rate === null ? "No job has finished yet" : "Of finished jobs in this list"}
			/>
			<Kpi
				label="Typical duration"
				value={typical === null ? "–" : formatDuration(typical)}
				hint={
					durations.length > 0
						? `Median of ${durations.length} finished ${durations.length === 1 ? "job" : "jobs"}`
						: "No job has finished yet"
				}
			/>
		</div>
	);
}
