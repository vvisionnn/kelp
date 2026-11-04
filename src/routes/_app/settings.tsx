import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/kelp/brand.tsx";
import { CopyButton } from "@/components/kelp/copy-button.tsx";
import { usePrefersReducedMotion } from "@/components/kelp/motion.ts";
import { ErrorState, PageHeader, Panel, Reveal, SkeletonBlock, StatusDot } from "@/components/kelp/page.tsx";
import { type Theme, useTheme } from "@/components/theme-provider.tsx";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { maintenanceQueries } from "@/lib/maintenance-queries.ts";
import { useSession } from "@/lib/session.ts";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/settings")({
	staticData: { section: "Operations", title: "Settings" },
	loader: ({ context }) =>
		Promise.all([
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
			<div className="grid max-w-4xl gap-4">
				<Reveal>
					<Panel title="Appearance" description="Saved in this browser.">
						<ThemePicker />
					</Panel>
				</Reveal>
				<Reveal delay={0.04}>
					<ClusterPanel />
				</Reveal>
				<Reveal delay={0.08}>
					<KelpPanel />
				</Reveal>
				<Reveal delay={0.12} className="grid gap-4 md:grid-cols-2">
					<Panel title="Keyboard shortcuts">
						<dl className="grid gap-3 text-sm">
							<Shortcut label="Search pages and actions">
								<KbdGroup>
									<Kbd>⌘</Kbd>
									<Kbd>K</Kbd>
								</KbdGroup>
								<span className="text-muted-foreground text-xs">or</span>
								<KbdGroup>
									<Kbd>Ctrl</Kbd>
									<Kbd>K</Kbd>
								</KbdGroup>
							</Shortcut>
							<Shortcut label="Toggle the sidebar">
								<KbdGroup>
									<Kbd>⌘</Kbd>
									<Kbd>B</Kbd>
								</KbdGroup>
							</Shortcut>
							<Shortcut label="Close a dialog or panel">
								<Kbd>Esc</Kbd>
							</Shortcut>
						</dl>
					</Panel>
					<AboutPanel />
				</Reveal>
			</div>
		</>
	);
}

const THEMES: Array<{ value: Theme; label: string; description: string }> = [
	{ value: "system", label: "System", description: "Follows your device" },
	{ value: "light", label: "Tidepool", description: "Light" },
	{ value: "dark", label: "Abyss", description: "Dark" },
];

/** A tiny drawing of the Kelp shell in a given palette. */
function ThemePreview({ mode }: { mode: "light" | "dark" }) {
	const light = mode === "light";
	return (
		<div className={cn("flex h-full w-full gap-1.5 p-2", light ? "bg-[#f2f6f5]" : "bg-[#081210]")}>
			<div
				className={cn("flex w-1/4 flex-col gap-1 rounded-sm p-1", light ? "bg-[#e3ecea]" : "bg-[#0d1d1a]")}
			>
				<span className={cn("h-1.5 w-3/4 rounded-full", light ? "bg-[#0e7a6d]" : "bg-[#3dd6bc]")} />
				<span className={cn("h-1 w-full rounded-full", light ? "bg-[#c7d6d3]" : "bg-[#1f3a35]")} />
				<span className={cn("h-1 w-2/3 rounded-full", light ? "bg-[#c7d6d3]" : "bg-[#1f3a35]")} />
			</div>
			<div className="flex flex-1 flex-col gap-1.5">
				<div className={cn("h-1/2 rounded-sm p-1", light ? "bg-white" : "bg-[#0f211d]")}>
					<span className={cn("block h-1 w-1/2 rounded-full", light ? "bg-[#c7d6d3]" : "bg-[#1f3a35]")} />
					<span
						className={cn("mt-1.5 block h-1.5 w-full rounded-full", light ? "bg-[#d5e5e2]" : "bg-[#173430]")}
					>
						<span
							className={cn("block h-full w-2/3 rounded-full", light ? "bg-[#0e7a6d]" : "bg-[#3dd6bc]")}
						/>
					</span>
				</div>
				<div className="flex flex-1 gap-1.5">
					<span className={cn("flex-1 rounded-sm", light ? "bg-white" : "bg-[#0f211d]")} />
					<span className={cn("flex-1 rounded-sm", light ? "bg-white" : "bg-[#0f211d]")} />
				</div>
			</div>
		</div>
	);
}

export function ThemePicker() {
	const { theme, setTheme } = useTheme();
	const reduced = usePrefersReducedMotion();
	return (
		<RadioGroup
			value={theme}
			onValueChange={(value) => setTheme(value as Theme)}
			aria-label="Theme"
			className="grid gap-3 sm:grid-cols-3"
		>
			{THEMES.map((option) => {
				const selected = theme === option.value;
				return (
					<label
						key={option.value}
						htmlFor={`theme-${option.value}`}
						className="group relative cursor-pointer rounded-xl border p-2 transition-colors hover:bg-muted/40 has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
					>
						{selected && (
							<motion.span
								layoutId={reduced ? undefined : "theme-selected"}
								className="pointer-events-none absolute inset-0 rounded-xl border-2 border-primary"
								transition={{ type: "spring", stiffness: 500, damping: 38 }}
							/>
						)}
						<div className="relative aspect-[16/9] overflow-hidden rounded-lg ring-1 ring-foreground/10">
							{option.value === "system" ? (
								<div className="relative h-full w-full">
									<ThemePreview mode="light" />
									<div className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]">
										<ThemePreview mode="dark" />
									</div>
								</div>
							) : (
								<ThemePreview mode={option.value} />
							)}
						</div>
						<div className="mt-2 flex items-center gap-2 px-1">
							<RadioGroupItem id={`theme-${option.value}`} value={option.value} aria-label={option.label} />
							<span className="font-medium text-sm">{option.label}</span>
							<span className="text-muted-foreground text-xs">{option.description}</span>
						</div>
						<span className="sr-only">{selected ? "(selected)" : ""}</span>
					</label>
				);
			})}
		</RadioGroup>
	);
}

function Row({ label, children, copy }: { label: string; children: ReactNode; copy?: string }) {
	return (
		<div className="grid gap-1 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[12rem_1fr] sm:items-center">
			<dt className="text-muted-foreground text-sm">{label}</dt>
			<dd className="flex min-w-0 items-center gap-1 text-sm">
				<span className="min-w-0 break-all">{children}</span>
				{copy && <CopyButton value={copy} label={`Copy ${label.toLowerCase()}`} />}
			</dd>
		</div>
	);
}

function Mono({ children }: { children: ReactNode }) {
	return <span className="font-mono text-xs">{children}</span>;
}

function NotSet() {
	return <span className="text-muted-foreground">Not set</span>;
}

function ClusterPanel() {
	const { data, error, isPending, refetch } = useQuery(maintenanceQueries.systemConfig());
	return (
		<Panel title="Cluster" description="Read from the SeaweedFS admin server">
			{isPending ? (
				<PanelSkeleton rows={5} />
			) : error ? (
				<ErrorState error={error} onRetry={() => refetch()} />
			) : (
				<dl className="divide-y">
					<Row label="Master" copy={data.masterAddress}>
						<Mono>{data.masterAddress}</Mono>
					</Row>
					<Row label="Admin data folder">{data.dataDir ? <Mono>{data.dataDir}</Mono> : <NotSet />}</Row>
					<Row label="Automated maintenance">
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
					</Row>
					<Row label="Cache lifetime">
						{data.cacheExpiration || <NotSet />}
						{data.filerCacheExpiration && (
							<span className="text-muted-foreground"> (filer {data.filerCacheExpiration})</span>
						)}
					</Row>
					<Row label="Public S3 endpoint" {...(data.s3PublicEndpoint ? { copy: data.s3PublicEndpoint } : {})}>
						{data.s3PublicEndpoint ? <Mono>{data.s3PublicEndpoint}</Mono> : <NotSet />}
					</Row>
				</dl>
			)}
		</Panel>
	);
}

function KelpPanel() {
	const user = useSession();
	const { data, error, isPending, refetch } = useQuery(maintenanceQueries.kelpSettings());
	return (
		<Panel title="Kelp" description="Set with environment variables when Kelp starts">
			{isPending ? (
				<PanelSkeleton rows={6} />
			) : error ? (
				<ErrorState error={error} onRetry={() => refetch()} />
			) : (
				<dl className="divide-y">
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
		</Panel>
	);
}

function AboutPanel() {
	const { data } = useQuery(maintenanceQueries.kelpSettings());
	return (
		<Panel title="About">
			<div className="flex items-center gap-3">
				<Wordmark />
				{data && <span className="font-mono text-muted-foreground text-xs">v{data.version}</span>}
			</div>
			<p className="mt-3 text-muted-foreground text-sm">
				A console for SeaweedFS. Kelp talks to the cluster you already run and never changes how SeaweedFS
				stores data.
			</p>
			<ul className="mt-3 space-y-1.5 text-sm">
				<li>
					<a
						href={REPO}
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-1 text-primary hover:underline"
					>
						Source and releases
						<ExternalLink className="size-3" />
					</a>
				</li>
				<li>
					<a
						href="https://github.com/seaweedfs/seaweedfs/wiki"
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-1 text-primary hover:underline"
					>
						SeaweedFS documentation
						<ExternalLink className="size-3" />
					</a>
				</li>
			</ul>
		</Panel>
	);
}

function Shortcut({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex items-center justify-between gap-3">
			<dt>{label}</dt>
			<dd className="flex items-center gap-1.5">{children}</dd>
		</div>
	);
}

function PanelSkeleton({ rows }: { rows: number }) {
	return (
		<div className="space-y-3" role="status" aria-busy="true" aria-label="Loading">
			{Array.from({ length: rows }, (_, i) => i).map((row) => (
				<SkeletonBlock key={row} className="h-5" />
			))}
		</div>
	);
}
