import type { Telemetry } from "@shared/telemetry.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/kelp/brand.tsx";
import { CopyButton } from "@/components/kelp/copy-button.tsx";
import { InfoGhost } from "@/components/kelp/maintenance/parts.tsx";
import { InfoList, PageHeader, Section, SkeletonBlock, StatusDot } from "@/components/kelp/page.tsx";
import { ThemePicker } from "@/components/kelp/settings/theme-picker.tsx";
import { LoadingRegion } from "@/components/kelp/skeletons.tsx";
import { RollingValue, TextMorph } from "@/components/kelp/text-morph.tsx";
import { Loaded, Swap } from "@/components/kelp/transitions.tsx";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { formatDateTime } from "@/lib/format.ts";
import { maintenanceQueries } from "@/lib/maintenance-queries.ts";
import { queries } from "@/lib/queries.ts";
import { useSession } from "@/lib/session.ts";

export const Route = createFileRoute("/_app/settings")({
	staticData: { section: "Operations", title: "Settings" },
	loader: ({ context }) =>
		void Promise.all([
			context.queryClient.prefetchQuery(maintenanceQueries.systemConfig()),
			context.queryClient.prefetchQuery(maintenanceQueries.kelpSettings()),
		]),
	component: SettingsPage,
});

const REPO = "https://github.com/vvisionnn/kelp";

function SettingsPage() {
	return (
		<>
			<PageHeader title="Settings" description="How Kelp looks for you, and how it connects to SeaweedFS." />
			<div className="max-w-3xl">
				<Section title="Appearance" description="Saved in this browser." className="mt-0">
					<div className="group-sheet p-4">
						<ThemePicker />
					</div>
				</Section>
				<ClusterPanel />
				<MetricsPanel />
				<KelpPanel />
				<Section title="Keyboard shortcuts">
					<dl className="group-sheet divide-y divide-border text-[13px]">
						<Shortcut label="Search pages and actions">
							<KbdGroup>
								<Kbd>⌘</Kbd>
								<Kbd>K</Kbd>
							</KbdGroup>
							<span className="text-[12px] text-muted-foreground">or</span>
							<KbdGroup>
								<Kbd>Ctrl</Kbd>
								<Kbd>K</Kbd>
							</KbdGroup>
						</Shortcut>
						<Shortcut label="Close a dialog or panel">
							<Kbd>Esc</Kbd>
						</Shortcut>
					</dl>
				</Section>
				<AboutPanel />
			</div>
		</>
	);
}

/** Whether Kelp is sampling SeaweedFS's metrics for live charts, and from where. */
function MetricsPanel() {
	const { data, error } = useQuery(queries.telemetry("1h"));
	// A failed refresh keeps the last answer; only a first failure replaces the rows.
	const metrics = { data: data ?? (error ? null : undefined), error: null };
	return (
		<Section
			title="Live metrics"
			description="Kelp samples SeaweedFS's Prometheus endpoints every 15 seconds for the live charts."
		>
			<Loaded
				query={metrics}
				skeleton={
					<LoadingRegion label="Loading">
						<InfoGhost rows={4} />
					</LoadingRegion>
				}
			>
				{(telemetry) =>
					telemetry ? (
						<InfoList
							items={[
								{ label: "Status", value: <MetricsStatus telemetry={telemetry} /> },
								{
									label: "Sampling since",
									value: (
										<TextMorph>
											{telemetry.since
												? formatDateTime(new Date(telemetry.since).toISOString())
												: "Not started"}
										</TextMorph>
									),
								},
								{
									label: "Points in the last hour",
									value: <RollingValue text={String(telemetry.points.length)} />,
								},
								{
									label: "Growth samples",
									value: <RollingValue text={String(telemetry.inventory.length)} />,
								},
								...(telemetry.unreachable.length
									? [
											{
												label: "Unreachable",
												value: (
													<span className="font-mono text-[12px]">{telemetry.unreachable.join(", ")}</span>
												),
											},
										]
									: []),
							]}
						/>
					) : (
						<p className="group-sheet px-4 py-3 text-[13px] text-muted-foreground">
							Kelp could not read its metrics status: {(error as Error).message}
						</p>
					)
				}
			</Loaded>
		</Section>
	);
}

function MetricsStatus({ telemetry }: { telemetry: Telemetry }) {
	const [tone, label] = !telemetry.enabled
		? (["idle", "Off. Set KELP_METRICS_URLS to turn on live charts."] as const)
		: telemetry.unreachable.length
			? (["warn", "Some endpoints are unreachable"] as const)
			: (["good", "Sampling"] as const);
	return (
		<Swap id={label}>
			<StatusDot tone={tone} label={label} />
		</Swap>
	);
}

function Row({ label, children, copy }: { label: string; children: ReactNode; copy?: string }) {
	return (
		<div className="flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
			<dt className="text-[13px] text-muted-foreground">{label}</dt>
			<dd className="flex min-w-0 items-center gap-1 text-[13px]">
				<span className="min-w-0 break-all text-right">{children}</span>
				{copy && <CopyButton value={copy} label={`Copy ${label.toLowerCase()}`} />}
			</dd>
		</div>
	);
}

function Mono({ children }: { children: ReactNode }) {
	return <span className="font-mono text-[12px]">{children}</span>;
}

function NotSet() {
	return <span className="text-muted-foreground">Not set</span>;
}

function ClusterPanel() {
	const query = useQuery(maintenanceQueries.systemConfig());
	return (
		<Section title="Cluster" description="Read from the SeaweedFS admin server">
			<Loaded query={query} skeleton={<PanelSkeleton rows={5} />}>
				{(data) => (
					<dl className="group-sheet divide-y divide-border">
						<Row label="Master" copy={data.masterAddress}>
							<Mono>{data.masterAddress}</Mono>
						</Row>
						<Row label="Admin data folder">{data.dataDir ? <Mono>{data.dataDir}</Mono> : <NotSet />}</Row>
						<Row label="Automated maintenance">
							<Swap id={String(data.maintenanceEnabled && data.maintenanceRunning)}>
								<StatusDot
									tone={data.maintenanceEnabled ? (data.maintenanceRunning ? "good" : "warn") : "idle"}
									label={
										data.maintenanceEnabled
											? data.maintenanceRunning
												? "On and running"
												: "On, but not running"
											: "Off"
									}
								/>
							</Swap>
						</Row>
						<Row label="Cache lifetime">
							{data.cacheExpiration || <NotSet />}
							{data.filerCacheExpiration && (
								<span className="text-muted-foreground"> (filer {data.filerCacheExpiration})</span>
							)}
						</Row>
						<Row
							label="Public S3 endpoint"
							{...(data.s3PublicEndpoint ? { copy: data.s3PublicEndpoint } : {})}
						>
							{data.s3PublicEndpoint ? <Mono>{data.s3PublicEndpoint}</Mono> : <NotSet />}
						</Row>
					</dl>
				)}
			</Loaded>
		</Section>
	);
}

function KelpPanel() {
	const user = useSession();
	const query = useQuery(maintenanceQueries.kelpSettings());
	return (
		<Section title="Kelp" description="Set with environment variables when Kelp starts">
			<Loaded query={query} skeleton={<PanelSkeleton rows={6} />}>
				{(data) => (
					<dl className="group-sheet divide-y divide-border">
						<Row label="Signed in as">
							{user.name}{" "}
							<span className="text-muted-foreground">
								({user.role === "admin" ? "administrator" : "read-only"})
							</span>
						</Row>
						<Row label="Sessions last">
							{data.sessionTtlHours} {data.sessionTtlHours === 1 ? "hour" : "hours"}
						</Row>
						<Row label="Read-only account">{data.viewerEnabled ? "Enabled" : "Not configured"}</Row>
						<Row label="S3 endpoint for users" {...(data.s3Endpoint ? { copy: data.s3Endpoint } : {})}>
							{data.s3Endpoint ? <Mono>{data.s3Endpoint}</Mono> : <NotSet />}
						</Row>
						{data.upstreams.map((upstream) => (
							<Row key={upstream.label} label={upstream.label}>
								<Mono>{upstream.url}</Mono>
							</Row>
						))}
					</dl>
				)}
			</Loaded>
		</Section>
	);
}

function AboutPanel() {
	const { data, error } = useQuery(maintenanceQueries.kelpSettings());
	return (
		<Section title="About">
			<div className="group-sheet divide-y divide-border text-[13px]">
				<div className="flex items-center gap-3 px-4 py-3">
					<Wordmark className="text-[15px]" />
					<Swap id={data ? "version" : "loading"}>
						{data ? (
							<span className="rounded-sm bg-secondary px-1.5 font-mono text-[12px] text-muted-foreground">
								v{data.version}
							</span>
						) : (
							!error && <SkeletonBlock className="h-[18px] w-14" />
						)}
					</Swap>
					<p className="ml-auto hidden text-[12px] text-muted-foreground sm:block">
						Never changes how SeaweedFS stores data.
					</p>
				</div>
				<a
					href={REPO}
					target="_blank"
					rel="noreferrer"
					className="flex h-10 items-center justify-between px-4 hover:bg-raised/70"
				>
					Source and releases
					<ExternalLink className="size-3.5 text-muted-foreground" />
				</a>
				<a
					href="https://github.com/seaweedfs/seaweedfs/wiki"
					target="_blank"
					rel="noreferrer"
					className="flex h-10 items-center justify-between px-4 hover:bg-raised/70"
				>
					SeaweedFS documentation
					<ExternalLink className="size-3.5 text-muted-foreground" />
				</a>
			</div>
		</Section>
	);
}

function Shortcut({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex h-10 items-center justify-between gap-3 px-4">
			<dt>{label}</dt>
			<dd className="flex items-center gap-1.5">{children}</dd>
		</div>
	);
}

function PanelSkeleton({ rows }: { rows: number }) {
	return (
		<LoadingRegion label="Loading">
			<InfoGhost rows={rows} />
		</LoadingRegion>
	);
}
