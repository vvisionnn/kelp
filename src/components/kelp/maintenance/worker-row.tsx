import type { MaintenanceWorker } from "@shared/maintenance.ts";
import { Collapse, JobTypeIcon } from "@/components/kelp/maintenance/parts.tsx";
import { CapacityBar } from "@/components/kelp/page.tsx";
import { TextMorph } from "@/components/kelp/text-morph.tsx";
import { formatRelative } from "@/lib/format.ts";

export function WorkerRow({ worker, names }: { worker: MaintenanceWorker; names: Record<string, string> }) {
	const queued = Object.values(worker.queuedByType).reduce((sum, n) => sum + n, 0);
	return (
		<li className="px-4 py-3">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="truncate font-mono text-[13px]">{worker.address || worker.id}</p>
					<p className="text-[12px] text-muted-foreground">
						SeaweedFS {worker.version.split(" ")[0] || "unknown"}, connected{" "}
						{formatRelative(worker.connectedAt)}
					</p>
				</div>
				<span className="inline-flex shrink-0 items-center gap-1.5 text-[12px]">
					<span className="size-2 shrink-0 rounded-full bg-success" />
					<TextMorph>{`Seen ${formatRelative(worker.lastSeenAt)}`}</TextMorph>
				</span>
			</div>
			<div className="mt-3 grid grid-cols-2 gap-4 text-[12px]">
				<div>
					<p className="mb-1.5 flex justify-between text-muted-foreground">
						<span>Detection slots</span>
						<TextMorph className="tabular">
							{`${worker.detectionSlots.used}/${worker.detectionSlots.total}`}
						</TextMorph>
					</p>
					<CapacityBar used={worker.detectionSlots.used} total={worker.detectionSlots.total} />
				</div>
				<div>
					<p className="mb-1.5 flex justify-between text-muted-foreground">
						<span>Execution slots</span>
						<TextMorph className="tabular">
							{`${worker.executionSlots.used}/${worker.executionSlots.total}`}
						</TextMorph>
					</p>
					<CapacityBar used={worker.executionSlots.used} total={worker.executionSlots.total} />
				</div>
			</div>
			<Collapse open={worker.running.length > 0 || queued > 0}>
				<ul className="mt-3 space-y-1 text-[12px]">
					{worker.running.map((work) => (
						<li key={work.id} className="flex items-center justify-between gap-2">
							<span className="truncate">
								{work.kind === "detection" ? "Checking" : "Running"} {names[work.jobType] ?? work.jobType}
							</span>
							<TextMorph className="tabular text-muted-foreground">{`${Math.round(work.progress)}%`}</TextMorph>
						</li>
					))}
					{queued > 0 && (
						<li className="text-muted-foreground">
							<TextMorph>{`${queued} queued on this worker`}</TextMorph>
						</li>
					)}
				</ul>
			</Collapse>
			<div className="mt-3 flex flex-wrap gap-1">
				{worker.capabilities.map((cap) => (
					<span
						key={cap.jobType}
						className="inline-flex h-5 items-center gap-1 rounded-sm bg-secondary px-1.5 text-[12px] text-muted-foreground"
					>
						<JobTypeIcon jobType={cap.jobType} className="size-3" />
						{cap.displayName}
					</span>
				))}
			</div>
		</li>
	);
}
