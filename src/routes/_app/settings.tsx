import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/kelp/brand.tsx";
import { CopyButton } from "@/components/kelp/copy-button.tsx";
import { usePrefersReducedMotion } from "@/components/kelp/motion.ts";
import {
	AuroraCard,
	ErrorState,
	PageHeader,
	Panel,
	Reveal,
	SkeletonBlock,
	StatusDot,
} from "@/components/kelp/page.tsx";
import { type Theme, useTheme } from "@/components/theme-provider.tsx";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { maintenanceQueries } from "@/lib/maintenance-queries.ts";
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
			<Reveal>
				<AuroraCard className="p-6 sm:p-8">
					<div className="mb-7 flex flex-wrap items-end justify-between gap-2">
						<div>
							<h2 className="font-[450] text-3xl tracking-[-0.025em]">Appearance</h2>
							<p className="mt-1.5 text-[15px] text-foreground/70">Saved in this browser.</p>
						</div>
					</div>
					<ThemePicker />
				</AuroraCard>
			</Reveal>
			<Reveal delay={0.05} className="mt-4 grid items-start gap-4 lg:grid-cols-2">
				<ClusterPanel />
				<KelpPanel />
			</Reveal>
			<Reveal delay={0.1} className="mt-4 grid items-start gap-4 lg:grid-cols-2">
				<Panel title="Keyboard shortcuts">
					<dl className="grid gap-4 text-sm">
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
						<Shortcut label="Close a dialog or panel">
							<Kbd>Esc</Kbd>
						</Shortcut>
					</dl>
				</Panel>
				<AboutPanel />
			</Reveal>
		</>
	);
}

const THEMES: Array<{ value: Theme; label: string; description: string }> = [
	{ value: "system", label: "System", description: "Follows your device" },
	{ value: "light", label: "Tidepool", description: "Light" },
	{ value: "dark", label: "Abyss", description: "Dark" },
];

const PREVIEW = {
	light: { page: "#ffffff", card: "#f2f3f7", ink: "#0a0a0a", line: "rgb(10 10 10 / 0.12)", rays: 0.55 },
	dark: { page: "#0a0a0a", card: "#1a1a1a", ink: "#ffffff", line: "rgb(255 255 255 / 0.14)", rays: 0.9 },
};

/** A tiny drawing of Kelp in a given palette: the top bar, an aurora card and a stat row. */
function ThemePreview({ mode }: { mode: "light" | "dark" }) {
	const c = PREVIEW[mode];
	return (
		<div className="flex h-full w-full flex-col gap-2 p-2.5" style={{ background: c.page }}>
			<div className="flex items-center gap-1.5">
				<span className="size-2 rounded-full" style={{ background: c.ink }} />
				<span className="ml-auto flex gap-1 rounded-full p-0.5" style={{ background: c.card }}>
					<span className="h-1.5 w-4 rounded-full" style={{ background: c.ink }} />
					<span className="h-1.5 w-3 rounded-full" style={{ background: c.line }} />
					<span className="h-1.5 w-3 rounded-full" style={{ background: c.line }} />
				</span>
				<span className="ml-auto h-1.5 w-4 rounded-full" style={{ background: c.line }} />
			</div>
			<div
				className="relative flex-1 overflow-hidden rounded-md"
				style={{
					background: `radial-gradient(at 0% 100%, color-mix(in oklab, #1fa591 ${c.rays * 70}%, transparent), transparent 60%), radial-gradient(at 70% 30%, color-mix(in oklab, #8b6cf0 ${c.rays * 45}%, transparent), transparent 60%), radial-gradient(at 100% 0%, color-mix(in oklab, #f0607e ${c.rays * 35}%, transparent), transparent 55%), ${c.card}`,
				}}
			>
				<span className="absolute bottom-2 left-2 h-2.5 w-1/3 rounded-full" style={{ background: c.ink }} />
			</div>
			<div className="flex gap-2">
				{[0, 1, 2].map((i) => (
					<span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: c.line }} />
				))}
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
			className="grid gap-4 sm:grid-cols-3"
		>
			{THEMES.map((option) => {
				const selected = theme === option.value;
				return (
					<label
						key={option.value}
						htmlFor={`theme-${option.value}`}
						className="group relative cursor-pointer rounded-xl bg-background/55 p-2 backdrop-blur transition-colors hover:bg-background/75 has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
					>
						{selected && (
							<motion.span
								layoutId={reduced ? undefined : "theme-selected"}
								className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-foreground"
								transition={{ type: "spring", stiffness: 500, damping: 38 }}
							/>
						)}
						<div className="relative aspect-[16/10] overflow-hidden rounded-md ring-1 ring-foreground/10">
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
						<div className="mt-2.5 flex items-center gap-2 px-1.5 pb-1">
							<RadioGroupItem id={`theme-${option.value}`} value={option.value} aria-label={option.label} />
							<span className="font-medium text-sm">{option.label}</span>
							<span className="text-foreground/60 text-xs">{option.description}</span>
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
		<div className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[11rem_1fr] sm:items-center">
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
				<dl className="divide-y divide-hairline">
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
				<dl className="divide-y divide-hairline">
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
				<Wordmark className="text-lg" />
				{data && (
					<span className="inline-flex h-6 items-center rounded-full bg-foreground/[0.07] px-2.5 font-mono text-xs">
						v{data.version}
					</span>
				)}
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
						className="inline-flex items-center gap-1 text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
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
						className="inline-flex items-center gap-1 text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
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
