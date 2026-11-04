import type { JobState, MaintenanceJob } from "@shared/maintenance.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ListChecks } from "lucide-react";
import { z } from "zod";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import { elapsed, humanize, JobStateBadge, JobTypeIcon } from "@/components/kelp/maintenance/parts.tsx";
import { EmptyState, PageHeader, Reveal } from "@/components/kelp/page.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
				<div className="flex min-w-0 items-start gap-2.5">
					<span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-area/15 text-area">
						<JobTypeIcon jobType={row.original.jobType} className="size-3.5" />
					</span>
					<div className="min-w-0">
						<Link
							to="/maintenance/jobs/$jobId"
							params={{ jobId: row.original.id }}
							className="font-medium hover:underline"
						>
							{row.original.summary || humanize(row.original.jobType)}
						</Link>
						<p className="truncate text-muted-foreground text-xs">
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
				<span className="tabular text-xs">{elapsed(row.original.createdAt, row.original.completedAt)}</span>
			),
		},
		{
			accessorKey: "createdAt",
			header: "Created",
			cell: ({ row }) => (
				<span className="text-muted-foreground text-xs">{formatRelative(row.original.createdAt)}</span>
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
						<SelectTrigger className="w-52 rounded-full" aria-label="Filter by job type">
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
				<ToggleGroup
					spacing={0}
					value={[search.state ?? "all"]}
					onValueChange={(value: string[]) => {
						const next = value[0];
						if (!next) return;
						navigate({
							search: (prev) => ({
								...prev,
								state: next === "all" ? undefined : (next as (typeof STATES)[number]),
							}),
						});
					}}
					aria-label="Filter by state"
					className="hairline-t hairline-b mb-10 grid w-full grid-cols-3 rounded-none sm:grid-cols-6"
				>
					{FILTERS.map((filter) => (
						<ToggleGroupItem
							key={filter.value}
							value={filter.value}
							aria-label={filter.label}
							className="group/state relative flex h-auto flex-col-reverse items-start justify-end gap-2 rounded-none! border-hairline px-5 py-7 text-left font-normal hover:bg-foreground/[0.03] aria-pressed:bg-transparent sm:border-l sm:first:border-l-0 sm:first:pl-0"
						>
							<span className="text-[13px] text-muted-foreground group-aria-pressed/state:text-foreground">
								{filter.label}
							</span>
							<span className="font-[450] text-3xl text-foreground/50 leading-none tracking-[-0.03em] tabular transition-colors group-hover/state:text-foreground/80 group-aria-pressed/state:text-foreground sm:text-4xl">
								{countOf(filter.value)}
							</span>
							<span
								aria-hidden="true"
								className="absolute inset-x-5 -top-px h-0.5 rounded-full bg-area opacity-0 transition-opacity group-aria-pressed/state:opacity-100 sm:group-first/state:left-0"
							/>
						</ToggleGroupItem>
					))}
				</ToggleGroup>
				<DataTable
					data={jobs.data}
					isLoading={jobs.isPending}
					error={jobs.error}
					onRetry={() => jobs.refetch()}
					getRowId={(job) => job.id}
					searchText={(job) => `${job.summary} ${job.message} ${job.id} ${job.workerId}`}
					searchPlaceholder="Search jobs"
					columns={columns}
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
