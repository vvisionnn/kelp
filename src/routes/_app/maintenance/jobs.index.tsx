import type { JobState, MaintenanceJob } from "@shared/maintenance.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ListChecks } from "lucide-react";
import { z } from "zod";
import { Segmented } from "@/components/kelp/controls.tsx";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import { elapsed, humanize, JobStateBadge, JobTypeIcon } from "@/components/kelp/maintenance/parts.tsx";
import { EmptyState, PageHeader, Reveal } from "@/components/kelp/page.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatRelative } from "@/lib/format.ts";
import { maintenanceQueries } from "@/lib/maintenance-queries.ts";

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
	validateSearch: z.object({ jobType: z.string().optional(), state: z.enum(STATES).optional() }),
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) => void context.queryClient.prefetchQuery(maintenanceQueries.jobs(deps)),
	component: JobsPage,
});

function JobsPage() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const jobs = useQuery(maintenanceQueries.jobs(search));
	// The band counts every state for the chosen job type, whichever state is selected.
	const counted = useQuery(maintenanceQueries.jobs(search.jobType ? { jobType: search.jobType } : {}));
	const counts = (counted.data ?? []).reduce<Record<string, number>>((acc, job) => {
		acc[job.state] = (acc[job.state] ?? 0) + 1;
		return acc;
	}, {});
	const countOf = (value: "all" | JobState) =>
		value === "all" ? (counted.data?.length ?? 0) : (counts[value] ?? 0);
	const overview = useQuery(maintenanceQueries.overview());
	const names = Object.fromEntries((overview.data?.jobTypes ?? []).map((t) => [t.jobType, t.displayName]));
	const filtered = Boolean(search.jobType || search.state);

	const columns: Array<Column<MaintenanceJob>> = [
		{
			accessorKey: "summary",
			header: "Job",
			cell: ({ row }) => (
				<div className="flex min-w-0 items-center gap-2.5">
					<span className="tile size-6 rounded-[6px] [--tile:#636366] [&_svg]:size-3.5">
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
		},
		{
			accessorKey: "state",
			header: "State",
			cell: ({ row }) => <JobStateBadge state={row.original.state} progress={row.original.progress} />,
		},
		{
			id: "duration",
			header: "Duration",
			cell: ({ row }) => (
				<span className="tabular">{elapsed(row.original.createdAt, row.original.completedAt)}</span>
			),
		},
		{
			accessorKey: "createdAt",
			header: "Created",
			cell: ({ row }) => (
				<span className="text-muted-foreground">{formatRelative(row.original.createdAt)}</span>
			),
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
			<Reveal>
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
								className="w-max shrink-0"
								label="Filter by state"
								items={FILTERS.map((filter) => ({
									value: filter.value,
									label: (
										<span className="inline-flex items-center gap-1.5">
											{filter.label}
											<span className="text-muted-foreground tabular">{countOf(filter.value)}</span>
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
			</Reveal>
		</>
	);
}
