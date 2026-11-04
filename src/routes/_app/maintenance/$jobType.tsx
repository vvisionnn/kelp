import type { DetectionResult, JobRun, MaintenanceJob } from "@shared/maintenance.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { History, ListChecks, Play, RefreshCw, ScanSearch } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { ConfirmDialog } from "@/components/kelp/confirm-dialog.tsx";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import {
	ActivityFeed,
	formatDuration,
	humanize,
	JobStateBadge,
	JobTypeIcon,
	OutcomeBadge,
} from "@/components/kelp/maintenance/parts.tsx";
import { SettingsForm } from "@/components/kelp/maintenance/settings-form.tsx";
import { EmptyState, ErrorState, PageHeader, Reveal, SkeletonBlock } from "@/components/kelp/page.tsx";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateTime, formatRelative } from "@/lib/format.ts";
import { maintenanceApi, maintenanceQueries } from "@/lib/maintenance-queries.ts";
import { useAction } from "@/lib/mutations.ts";
import { useCanWrite } from "@/lib/session.ts";

const TABS = ["settings", "jobs", "history"] as const;

export const Route = createFileRoute("/_app/maintenance/$jobType")({
	staticData: { section: "Operations", title: "Maintenance" },
	validateSearch: z.object({ tab: z.enum(TABS).optional() }),
	loader: ({ context, params }) =>
		context.queryClient.prefetchQuery(maintenanceQueries.jobType(params.jobType)),
	component: JobTypePage,
});

/** Toast text for a detection: what was found, or why nothing was. */
export function detectionMessage(result: DetectionResult, name: string): string {
	if (result.error) return `${name} check failed: ${result.error}`;
	if (result.totalProposals > 0) {
		return `${name} found ${result.totalProposals} ${result.totalProposals === 1 ? "job" : "jobs"} to run`;
	}
	return result.skippedReason ? `${name} skipped: ${result.skippedReason}` : `${name} found nothing to do`;
}

function JobTypePage() {
	const { jobType } = Route.useParams();
	const { tab = "settings" } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const canWrite = useCanWrite();
	const config = useQuery(maintenanceQueries.jobType(jobType));
	const [detection, setDetection] = useState<DetectionResult | null>(null);
	const name = config.data?.displayName ?? humanize(jobType);

	const invalidate = [["maintenance"]];
	const save = useAction({
		run: (update: Parameters<typeof maintenanceApi.saveConfig>[1]) =>
			maintenanceApi.saveConfig(jobType, update),
		success: `${name} settings saved`,
		invalidate,
	});
	const refreshForm = useAction({
		run: () => maintenanceApi.refreshForm(jobType),
		success: "Settings form reloaded from the worker",
		invalidate,
	});
	const detect = useAction({
		run: () => maintenanceApi.detect(jobType),
		success: (result) => detectionMessage(result, name),
		invalidate,
		onSuccess: (result) => setDetection(result),
	});
	const run = useAction({
		run: () => maintenanceApi.run(jobType),
		success: (result) =>
			result.executed > 0
				? `${name} ran ${result.executed} ${result.executed === 1 ? "job" : "jobs"}: ${result.succeeded} succeeded, ${result.failed} failed`
				: `${name} found nothing to run`,
		invalidate,
	});

	if (config.isPending) return <JobTypeSkeleton />;
	if (config.error) {
		return (
			<>
				<PageHeader title={name} />
				<ErrorState error={config.error} onRetry={() => config.refetch()} />
			</>
		);
	}

	return (
		<>
			<PageHeader
				title={name}
				description={
					<span className="flex items-center gap-2">
						<JobTypeIcon jobType={jobType} className="size-4 shrink-0 text-primary" />
						{config.data.description}
					</span>
				}
				actions={
					canWrite && (
						<>
							<Button variant="outline" disabled={detect.isPending} onClick={() => detect.mutate()}>
								{detect.isPending ? <Spinner /> : <ScanSearch />}
								Check for work
							</Button>
							<ConfirmDialog
								trigger={
									<Button disabled={run.isPending}>
										{run.isPending ? <Spinner /> : <Play />}
										Run now
									</Button>
								}
								title={`Run ${name} now?`}
								description="Kelp checks for work right away and starts every job it finds, even outside the schedule. Jobs use cluster resources while they run."
								confirmLabel="Run now"
								onConfirm={() => run.mutateAsync()}
							/>
						</>
					)
				}
			/>
			<Tabs
				value={tab}
				onValueChange={(value) => navigate({ search: { tab: value as (typeof TABS)[number] } })}
			>
				<div className="mb-4 flex items-center justify-between gap-3">
					<TabsList variant="line">
						<TabsTrigger value="settings">Settings</TabsTrigger>
						<TabsTrigger value="jobs">Jobs</TabsTrigger>
						<TabsTrigger value="history">Run history</TabsTrigger>
					</TabsList>
					{tab === "settings" && (
						<div className="flex items-center gap-1">
							{config.data.updatedAt && (
								<p className="hidden text-muted-foreground text-xs sm:block">
									Saved {formatRelative(config.data.updatedAt)}
									{config.data.updatedBy && ` by ${config.data.updatedBy}`}
								</p>
							)}
							{canWrite && (
								<Tooltip>
									<TooltipTrigger
										render={
											<Button
												variant="ghost"
												size="icon-sm"
												aria-label="Reload settings form from the worker"
												disabled={refreshForm.isPending}
												onClick={() => refreshForm.mutate()}
											>
												<RefreshCw className={refreshForm.isPending ? "animate-spin" : undefined} />
											</Button>
										}
									/>
									<TooltipContent>Reload settings form from the worker</TooltipContent>
								</Tooltip>
							)}
						</div>
					)}
				</div>
				<TabsContent value="settings">
					<Reveal>
						<SettingsForm
							key={config.data.updatedAt ?? "new"}
							config={config.data}
							canWrite={canWrite}
							onSave={(update) => save.mutateAsync(update)}
						/>
					</Reveal>
				</TabsContent>
				<TabsContent value="jobs">
					<JobsTab jobType={jobType} />
				</TabsContent>
				<TabsContent value="history">
					<HistoryTab jobType={jobType} />
				</TabsContent>
			</Tabs>
			<DetectionSheet
				result={detection}
				name={name}
				running={run.isPending}
				onRun={async () => {
					await run.mutateAsync();
					setDetection(null);
				}}
				onClose={() => setDetection(null)}
			/>
		</>
	);
}

export const jobColumns: Array<Column<MaintenanceJob>> = [
	{
		accessorKey: "summary",
		header: "Job",
		cell: ({ row }) => (
			<div className="min-w-0">
				<Link
					to="/maintenance/jobs/$jobId"
					params={{ jobId: row.original.id }}
					className="font-medium hover:underline"
				>
					{row.original.summary || humanize(row.original.jobType)}
				</Link>
				<p className="truncate text-muted-foreground text-xs">
					{row.original.message || row.original.resultSummary}
				</p>
			</div>
		),
		size: 320,
	},
	{
		accessorKey: "state",
		header: "State",
		cell: ({ row }) => <JobStateBadge state={row.original.state} progress={row.original.progress} />,
	},
	{
		accessorKey: "attempt",
		header: "Attempt",
		cell: ({ row }) => <span className="tabular">{row.original.attempt || 1}</span>,
	},
	{
		accessorKey: "createdAt",
		header: "Created",
		cell: ({ row }) => (
			<span className="text-muted-foreground text-xs">{formatRelative(row.original.createdAt)}</span>
		),
	},
	{
		accessorKey: "completedAt",
		header: "Finished",
		cell: ({ row }) => (
			<span className="text-muted-foreground text-xs">{formatRelative(row.original.completedAt)}</span>
		),
	},
];

function JobsTab({ jobType }: { jobType: string }) {
	const { data, isPending, error, refetch } = useQuery(maintenanceQueries.jobs({ jobType }));
	return (
		<DataTable
			data={data}
			isLoading={isPending}
			error={error}
			onRetry={() => refetch()}
			getRowId={(job) => job.id}
			searchText={(job) => `${job.summary} ${job.message} ${job.id}`}
			searchPlaceholder="Search jobs"
			columns={jobColumns}
			toolbar={
				<Button variant="ghost" size="sm" render={<Link to="/maintenance/jobs" search={{ jobType }} />}>
					<ListChecks />
					Open in all jobs
				</Button>
			}
			empty={
				<EmptyState
					icon={<ListChecks />}
					title="No jobs yet"
					description="Jobs appear here after a check finds work. Use Check for work to look now."
				/>
			}
		/>
	);
}

const runColumns: Array<Column<JobRun>> = [
	{
		accessorKey: "outcome",
		header: "Outcome",
		cell: ({ row }) => <OutcomeBadge outcome={row.original.outcome} />,
	},
	{
		accessorKey: "message",
		header: "Result",
		cell: ({ row }) =>
			row.original.jobId ? (
				<Link
					to="/maintenance/jobs/$jobId"
					params={{ jobId: row.original.jobId }}
					className="hover:underline"
				>
					{row.original.message || "Open job"}
				</Link>
			) : (
				row.original.message
			),
		size: 360,
	},
	{
		accessorKey: "durationMs",
		header: "Duration",
		cell: ({ row }) => <span className="tabular">{formatDuration(row.original.durationMs)}</span>,
	},
	{
		accessorKey: "completedAt",
		header: "Finished",
		cell: ({ row }) => (
			<span className="text-muted-foreground text-xs" title={formatDateTime(row.original.completedAt)}>
				{formatRelative(row.original.completedAt)}
			</span>
		),
	},
];

function HistoryTab({ jobType }: { jobType: string }) {
	const { data, isPending, error, refetch } = useQuery(maintenanceQueries.runs(jobType));
	return (
		<DataTable
			data={data}
			isLoading={isPending}
			error={error}
			onRetry={() => refetch()}
			getRowId={(run) => run.runId}
			columns={runColumns}
			empty={
				<EmptyState
					icon={<History />}
					title="No runs yet"
					description="Finished jobs are recorded here, newest first."
				/>
			}
		/>
	);
}

const PRIORITY_VARIANT = {
	critical: "destructive-light",
	high: "warning-light",
	normal: "info-light",
	low: "outline",
	unspecified: "outline",
} as const;

function DetectionSheet({
	result,
	name,
	running,
	onRun,
	onClose,
}: {
	result: DetectionResult | null;
	name: string;
	running: boolean;
	onRun: () => Promise<void>;
	onClose: () => void;
}) {
	return (
		<Sheet open={result !== null} onOpenChange={(open) => !open && onClose()}>
			<SheetContent className="w-full overflow-y-auto sm:max-w-lg">
				<SheetHeader>
					<SheetTitle>{name} check</SheetTitle>
					<SheetDescription>
						{result && result.totalProposals > 0
							? `Found ${result.totalProposals} ${result.totalProposals === 1 ? "job" : "jobs"}. Run now to start them, or let the schedule pick them up.`
							: "Nothing needs doing right now."}
					</SheetDescription>
				</SheetHeader>
				{result && result.totalProposals > 0 && (
					<div className="px-4">
						<Button disabled={running} onClick={() => void onRun().catch(() => {})}>
							{running ? <Spinner /> : <Play />}
							Run these jobs
						</Button>
					</div>
				)}
				{result && (
					<div className="space-y-6 px-4 pb-6">
						{result.error && (
							<p className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm">
								{result.error}
							</p>
						)}
						{result.skippedReason && (
							<p className="rounded-lg bg-muted px-3 py-2 text-sm">
								Skipped: {result.skippedReason}
								{result.eligibleAfter && ` Eligible again ${formatRelative(result.eligibleAfter)}.`}
							</p>
						)}
						{result.proposals.length > 0 && (
							<section>
								<h3 className="mb-2 font-medium text-sm">Proposed jobs</h3>
								<ul className="space-y-2">
									{result.proposals.map((proposal) => (
										<li key={proposal.id} className="rounded-lg border p-3">
											<div className="flex items-start justify-between gap-2">
												<p className="font-medium text-sm">{proposal.summary || proposal.id}</p>
												<Badge variant={PRIORITY_VARIANT[proposal.priority]} className="capitalize">
													{proposal.priority === "unspecified" ? "normal" : proposal.priority}
												</Badge>
											</div>
											{proposal.detail && (
												<p className="mt-1 text-muted-foreground text-xs">{proposal.detail}</p>
											)}
											{Object.keys(proposal.labels).length > 0 && (
												<div className="mt-2 flex flex-wrap gap-1">
													{Object.entries(proposal.labels)
														.filter(([key, value]) => value && key !== "task_type")
														.map(([key, value]) => (
															<Badge key={key} variant="outline" className="font-normal">
																{humanize(key)}: <span className="font-mono">{value}</span>
															</Badge>
														))}
												</div>
											)}
										</li>
									))}
								</ul>
							</section>
						)}
						<section>
							<h3 className="mb-2 font-medium text-sm">How the worker decided</h3>
							<ActivityFeed activities={result.activities} showJobType={false} />
						</section>
					</div>
				)}
			</SheetContent>
		</Sheet>
	);
}

function JobTypeSkeleton() {
	return (
		<div role="status" aria-busy="true" aria-label="Loading job type">
			<SkeletonBlock className="mt-2 mb-2 h-8 w-56" />
			<SkeletonBlock className="mb-6 h-4 w-96 max-w-full" />
			<SkeletonBlock className="mb-4 h-8 w-64" />
			{[0, 1, 2].map((i) => (
				<SkeletonBlock key={i} className="mb-4 h-48 rounded-xl" />
			))}
		</div>
	);
}
