import { type QueryClient, useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useMatches, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { ChevronRight, ChevronsUpDown, LogOut, Monitor, Moon, PanelLeft, Search, Sun } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { lazy, type ReactElement, type ReactNode, Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { UNAUTHORIZED_EVENT } from "@/lib/api.ts";
import { formatBytes, formatPercent, ratio } from "@/lib/format.ts";
import { healthSummary } from "@/lib/health.ts";
import { queries } from "@/lib/queries.ts";
import { sessionQuery, useSession, useSignOut } from "@/lib/session.ts";
import { cn } from "@/lib/utils";
import { type Theme, useTheme } from "../theme-provider.tsx";
import { KelpMark } from "./brand.tsx";
import { SPRING } from "./motion.ts";
import { itemFor, NAV } from "./nav.ts";
import { CapacityBar } from "./page.tsx";
import { useSpotlight } from "./spotlight.ts";
import { TextMorph } from "./text-morph.tsx";

declare module "@tanstack/react-router" {
	interface StaticDataRouteOption {
		/** The nav section the page belongs to. */
		section?: string;
		title?: string;
		/** Names the item a detail page shows; defaults to the first URL parameter. */
		crumb?: (params: Record<string, string>, queryClient: QueryClient) => string | undefined;
	}
}

/** Whether `pathname` belongs to the nav item at `to` (the overview only matches itself). */
export function isActivePath(pathname: string, to: string): boolean {
	return to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
}

/** The deepest route with a title: it names the page and, on detail pages, the item. */
function useLeaf() {
	const matches = useMatches();
	return [...matches].reverse().find((m) => m.staticData?.title);
}

/** The item a detail page shows, named from loaded data when the route knows how. */
function useDetailName(): string | undefined {
	const leaf = useLeaf();
	const queryClient = useQueryClient();
	// Re-render when fetches settle so names that come from loaded data appear.
	useIsFetching();
	const params = (leaf?.params ?? {}) as Record<string, string>;
	return leaf?.staticData?.crumb?.(params, queryClient) ?? Object.values(params)[0];
}

/** The command menu's code loads the first time someone reaches for it, not with every page. */
const loadCommandMenu = () => import("./command-menu.tsx");
const CommandMenu = lazy(() => loadCommandMenu().then((m) => ({ default: m.CommandMenu })));

/** Open state for the command menu, toggled with ⌘K / Ctrl+K anywhere in the app. */
function useCommandMenu() {
	const [open, setOpen] = useState(false);
	// Mounted from the first opening on, so it can animate closed.
	const [wanted, setWanted] = useState(false);
	if (open && !wanted) setWanted(true);
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				setOpen((value) => !value);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);
	return { open, setOpen, wanted };
}

/** The cluster's health in a few words, and the dot color that goes with it. */
function useClusterStatus() {
	const { data, error } = useQuery(queries.overview());
	const health = data ? healthSummary(data) : undefined;
	// With nothing loaded, a failed request means Kelp can't reach the cluster at all.
	const unreachable = !data && Boolean(error);
	const dot =
		health || unreachable
			? { good: "bg-success", warn: "bg-warning", bad: "bg-destructive" }[
					unreachable ? "bad" : (health?.tone ?? "good")
				]
			: "bg-tertiary";
	const text = `${health ? health.text.split(".")[0] : unreachable ? "Can't reach the cluster" : "Connecting"}${data ? `, SeaweedFS ${data.versions.version.split(" ")[0] || ""}` : ""}`;
	return { dot, text };
}

const COLLAPSED_KEY = "kelp-sidebar-collapsed";

/** Whether the sidebar is folded to its icon rail. Remembered across visits; ⌘B / Ctrl+B toggles it. */
export function useSidebarCollapsed(): [boolean, () => void] {
	const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === "1");
	useEffect(() => {
		localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
	}, [collapsed]);
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key.toLowerCase() === "b" && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
				event.preventDefault();
				setCollapsed((value) => !value);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);
	return [collapsed, () => setCollapsed((value) => !value)];
}

/** On the icon rail a control names itself in a tooltip; in the full sidebar its label already does. */
function RailTip({ rail, label, children }: { rail: boolean; label: ReactNode; children: ReactElement }) {
	if (!rail) return children;
	return (
		<Tooltip>
			<TooltipTrigger render={children} />
			<TooltipContent side="right" sideOffset={10}>
				{label}
			</TooltipContent>
		</Tooltip>
	);
}

/**
 * How full the volume servers' disks are, at the foot of the sidebar: the one number an operator
 * wants from every page. The meter is the spectrum until it nears full, then turns to a warning.
 */
function SidebarCapacity({ rail, onNavigate }: { rail: boolean; onNavigate?: (() => void) | undefined }) {
	const { data } = useQuery(queries.overview());
	if (!data) return null;
	const used = data.volumeServers.reduce((sum, s) => sum + s.diskUsage, 0);
	const total = data.volumeServers.reduce((sum, s) => sum + s.diskCapacity, 0);
	if (total <= 0) return null;
	return (
		<Link
			to="/cluster"
			onClick={onNavigate}
			aria-hidden={rail || undefined}
			tabIndex={rail ? -1 : undefined}
			className={cn(
				"mx-2 mb-2 block rounded-lg p-2.5 transition-[opacity,background-color] hover:bg-accent/60",
				rail ? "pointer-events-none opacity-0 duration-100" : "delay-100 duration-200",
			)}
		>
			<span className="flex items-baseline justify-between gap-2 whitespace-nowrap text-[12px]">
				<span className="font-medium">Disk</span>
				<span className="text-muted-foreground tabular">
					<TextMorph>{`${formatPercent(ratio(used, total))} of ${formatBytes(total)}`}</TextMorph>
				</span>
			</span>
			<CapacityBar used={used} total={total} className="mt-2" />
		</Link>
	);
}

/**
 * Sidebar contents, shared by the docked sidebar and the compact-width sheet. Every icon, the
 * brand tile and the avatar sit on one vertical line, so folding to the rail only hides the words.
 */
function SidebarBody({ onNavigate, rail = false }: { onNavigate?: () => void; rail?: boolean }) {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const current = itemFor(pathname);
	const status = useClusterStatus();
	const [hovered, setHovered] = useState<string | null>(null);
	// Words fade out before the rail narrows under them, and back in once it has widened.
	const fade = cn(
		"overflow-hidden whitespace-nowrap transition-opacity",
		rail ? "pointer-events-none opacity-0 duration-100" : "delay-100 duration-200",
	);
	return (
		<TooltipProvider delay={350}>
			<div data-rail={rail ? "" : undefined} className="flex h-full min-h-0 flex-col">
				<RailTip rail={rail} label={`Kelp: ${status.text}`}>
					<Link
						to="/"
						onClick={onNavigate}
						className="mx-2 mt-2.5 flex h-12 items-center gap-2.5 rounded-lg px-1 transition-colors hover:bg-accent/60"
					>
						<span className="relative flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-[linear-gradient(180deg,#2c2c2e,#0e0e10)] text-white shadow-[inset_0_0_0_0.5px_rgb(255_255_255/0.12),0_1px_2px_rgb(0_0_0/0.2)]">
							<KelpMark className="size-5" />
							<span
								className={cn(
									"absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-[var(--sidebar)] transition-[opacity,background-color] duration-300",
									status.dot,
									!rail && "opacity-0",
								)}
							/>
						</span>
						<span className={cn("grid min-w-0 leading-tight", fade)}>
							<span className="font-semibold text-[15px] tracking-[-0.01em]">Kelp</span>
							<span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
								<span
									className={cn("size-1.5 shrink-0 rounded-full transition-colors duration-500", status.dot)}
								/>
								<span className="truncate">
									<TextMorph>{status.text}</TextMorph>
								</span>
							</span>
						</span>
					</Link>
				</RailTip>

				<nav
					aria-label="Pages"
					className="mt-3 min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2 pb-3"
					onPointerLeave={() => setHovered(null)}
				>
					{NAV.map((section, index) => (
						<div key={section.title} className={cn(index > 0 && "mt-3")}>
							{section.title !== "Overview" && (
								<div className="relative flex h-6 items-center px-3">
									<p className={cn("font-medium text-[11px] text-muted-foreground", fade)}>{section.title}</p>
									<span
										aria-hidden="true"
										className={cn(
											"absolute inset-x-3 top-1/2 h-px bg-border transition-opacity duration-150",
											!rail && "opacity-0",
										)}
									/>
								</div>
							)}
							<ul className="space-y-px">
								{section.items.map((item) => {
									const active = current?.to === item.to;
									return (
										<li key={item.to}>
											<RailTip rail={rail} label={item.title}>
												<Link
													to={item.to as "/"}
													onClick={onNavigate}
													onPointerEnter={() => setHovered(item.to)}
													data-active={active ? "" : undefined}
													aria-current={active ? "page" : undefined}
													className="group/nav relative isolate flex h-8 items-center gap-2.5 rounded-lg px-3 text-[13px] text-foreground/75 transition-colors hover:text-foreground active:scale-[0.98] data-active:font-medium data-active:text-foreground"
												>
													<AnimatePresence>
														{hovered === item.to && !active && (
															<motion.span
																layoutId="sidebar-hover"
																className="absolute inset-0 -z-10 rounded-lg bg-accent/60"
																initial={{ opacity: 0 }}
																animate={{ opacity: 1 }}
																exit={{ opacity: 0 }}
																transition={SPRING}
															/>
														)}
													</AnimatePresence>
													{active && (
														// The current page rests on a flat tint of the brand indigo.
														<motion.span
															layoutId="sidebar-active"
															className="absolute inset-0 -z-10 rounded-lg bg-[var(--nav-current)] shadow-[var(--nav-current-shadow)]"
															transition={SPRING}
														/>
													)}
													<item.icon
														className="size-4 shrink-0 text-muted-foreground transition-colors group-hover/nav:text-foreground group-data-active/nav:text-[var(--nav-current-icon)]"
														strokeWidth={1.75}
													/>
													<span className={fade}>{item.title}</span>
												</Link>
											</RailTip>
										</li>
									);
								})}
							</ul>
						</div>
					))}
				</nav>

				<SidebarCapacity rail={rail} onNavigate={onNavigate} />
				<div className="border-border border-t p-2">
					<AccountMenu rail={rail} />
				</div>
			</div>
		</TooltipProvider>
	);
}

const THEMES: Array<{ value: Theme; label: string; icon: ReactNode }> = [
	{ value: "system", label: "Automatic", icon: <Monitor /> },
	{ value: "light", label: "Light", icon: <Sun /> },
	{ value: "dark", label: "Dark", icon: <Moon /> },
];

function AccountMenu({ rail = false }: { rail?: boolean }) {
	const user = useSession();
	const { theme, setTheme } = useTheme();
	const signOut = useSignOut();
	const navigate = useNavigate();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<button
						type="button"
						aria-label="Account menu"
						className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-accent/60 aria-expanded:bg-accent"
					>
						<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(180deg,#8e8e93,#636366)] font-semibold text-[12px] text-white uppercase">
							{user.name.slice(0, 1)}
						</span>
						<span
							className={cn(
								"grid min-w-0 flex-1 leading-tight transition-opacity duration-150",
								rail && "opacity-0",
							)}
						>
							<span className="truncate font-medium text-[13px]">{user.name}</span>
							<span className="text-[11px] text-muted-foreground">
								{user.role === "admin" ? "Administrator" : "Read-only"}
							</span>
						</span>
						<ChevronsUpDown
							className={cn(
								"size-3.5 shrink-0 text-muted-foreground transition-opacity",
								rail && "opacity-0",
							)}
						/>
					</button>
				}
			/>
			<DropdownMenuContent side="top" align="start" className="w-56">
				<DropdownMenuGroup>
					<DropdownMenuLabel>Appearance</DropdownMenuLabel>
					<DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
						{THEMES.map((option) => (
							<DropdownMenuRadioItem key={option.value} value={option.value}>
								{option.icon}
								{option.label}
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={() => signOut.mutate(undefined, { onSettled: () => navigate({ to: "/login" }) })}
				>
					<LogOut />
					Sign out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function ThemeSwitch() {
	const { resolvedTheme, setTheme } = useTheme();
	const next = resolvedTheme === "dark" ? "light" : "dark";
	return (
		<Button
			variant="ghost"
			size="icon"
			aria-label={`Switch to ${next} theme`}
			onClick={() => setTheme(next)}
			className="text-muted-foreground hover:text-foreground"
		>
			{/* The icon turns when the theme changes, not when the page loads. */}
			<AnimatePresence initial={false} mode="popLayout">
				<motion.span
					key={resolvedTheme}
					initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
					animate={{ rotate: 0, opacity: 1, scale: 1 }}
					exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
					transition={{ type: "spring", stiffness: 400, damping: 22 }}
					className="flex"
				>
					{resolvedTheme === "dark" ? <Moon /> : <Sun />}
				</motion.span>
			</AnimatePresence>
		</Button>
	);
}

/** True once the page has scrolled under the toolbar. */
function useScrolled(): boolean {
	const [scrolled, setScrolled] = useState(false);
	useEffect(() => {
		const update = () => setScrolled(window.scrollY > 4);
		update();
		window.addEventListener("scroll", update, { passive: true });
		return () => window.removeEventListener("scroll", update);
	}, []);
	return scrolled;
}

/**
 * The page's toolbar: where you are (section, page and, on detail pages, the item, with the page
 * as a link back to its list), then search and the theme. Content scrolls under a solid bar with
 * a hairline; a blur here would cost a repaint on every scrolled frame.
 */
function Toolbar({
	onShowSidebar,
	onToggleRail,
	rail,
	onSearch,
}: {
	onShowSidebar: () => void;
	onToggleRail: () => void;
	rail: boolean;
	onSearch: () => void;
}) {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const leaf = useLeaf();
	const item = itemFor(pathname);
	const detail = useDetailName();
	const scrolled = useScrolled();
	const fetching = useIsFetching() > 0;
	const title = item?.title ?? leaf?.staticData?.title;
	return (
		<header
			data-toolbar=""
			className={cn(
				"sticky top-0 z-30 bg-background transition-shadow duration-200",
				scrolled && "shadow-[0_1px_0_var(--border)]",
			)}
		>
			<div className="flex h-13 items-center gap-1 px-4 xl:px-8">
				<Button
					variant="ghost"
					size="icon"
					aria-label="Show sidebar"
					className="-ml-1.5 text-muted-foreground lg:hidden"
					onClick={onShowSidebar}
				>
					<PanelLeft />
				</Button>
				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								variant="ghost"
								size="icon"
								aria-label={rail ? "Expand sidebar" : "Collapse sidebar"}
								className="-ml-1.5 hidden text-muted-foreground hover:text-foreground lg:inline-flex"
								onClick={onToggleRail}
							>
								<PanelLeft />
							</Button>
						}
					/>
					<TooltipContent side="bottom">
						{rail ? "Expand sidebar" : "Collapse sidebar"}
						<Kbd>⌘B</Kbd>
					</TooltipContent>
				</Tooltip>
				<span aria-hidden="true" className="mx-1.5 h-4 w-px bg-border" />
				<nav aria-label="Breadcrumb" className="min-w-0 flex-1">
					<ol className="flex min-w-0 items-center gap-1.5 text-[13px]">
						{item && item.section !== item.title && (
							<li className="hidden shrink-0 items-center gap-1.5 text-muted-foreground sm:flex">
								{item.section}
								<ChevronRight aria-hidden="true" className="size-3.5 text-tertiary" />
							</li>
						)}
						{detail && item ? (
							<>
								<li className="flex shrink-0 items-center gap-1.5">
									<Link
										to={item.to as "/"}
										className="-mx-1 rounded-md px-1 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
									>
										{item.title}
									</Link>
									<ChevronRight aria-hidden="true" className="size-3.5 text-tertiary" />
								</li>
								<li aria-current="page" className="min-w-0 truncate font-medium">
									{detail}
								</li>
							</>
						) : (
							title && (
								<li aria-current="page" className="min-w-0 truncate font-medium">
									{title}
								</li>
							)
						)}
					</ol>
				</nav>
				<div className="ml-auto flex shrink-0 items-center gap-1">
					<button
						type="button"
						aria-label="Search"
						onClick={onSearch}
						onPointerEnter={loadCommandMenu}
						onFocus={loadCommandMenu}
						className="flex h-8 items-center gap-2 rounded-lg bg-card px-2.5 text-[13px] text-muted-foreground shadow-[var(--sheet-shadow),0_0_0_0.5px_var(--border)] transition-colors hover:text-foreground sm:w-56"
					>
						<Search className="size-3.5" />
						<span className="hidden sm:inline">Search</span>
						<Kbd className="ml-auto hidden sm:inline-flex">⌘K</Kbd>
					</button>
					<ThemeSwitch />
				</div>
			</div>
			<div className="absolute inset-x-0 bottom-0 h-px overflow-hidden" aria-hidden="true">
				{/* Waits out the quick polls, so a live page isn't blinking at its edge. */}
				<div
					className={cn(
						"tide h-full w-full bg-primary/40 opacity-0 transition-opacity duration-300",
						fetching && "opacity-100 delay-700",
					)}
				/>
			</div>
		</header>
	);
}

function useSessionWatcher() {
	const queryClient = useQueryClient();
	const router = useRouter();
	useEffect(() => {
		const onUnauthorized = () => {
			const { pathname, href } = router.state.location;
			if (pathname === "/login") return;
			queryClient.removeQueries({ queryKey: sessionQuery.queryKey });
			router.navigate({ to: "/login", search: { redirect: href } });
		};
		window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
		return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
	}, [queryClient, router]);
}

export function AppShell() {
	useSessionWatcher();
	const command = useCommandMenu();
	useSpotlight();
	const [sheetOpen, setSheetOpen] = useState(false);
	const [rail, toggleRail] = useSidebarCollapsed();
	return (
		<div data-rail={rail ? "" : undefined} className="group/shell min-h-svh">
			{/* Docked full height on a flat surface of its own, set apart from the page by a hairline and
			    a soft edge shadow. Folding to the rail only narrows it. */}
			<aside
				aria-label="Sidebar"
				className="fixed inset-y-0 left-0 z-40 hidden w-60 overflow-clip bg-[var(--sidebar)] shadow-[var(--sidebar-edge)] transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-data-rail/shell:w-14 motion-reduce:transition-none lg:block"
			>
				<div className="h-full w-full">
					<SidebarBody rail={rail} />
				</div>
			</aside>
			<Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
				<SheetContent
					side="left"
					showCloseButton={false}
					className="w-72 gap-0 bg-[var(--sidebar)] p-0 sm:max-w-72"
				>
					<SheetTitle className="sr-only">Pages</SheetTitle>
					<SidebarBody onNavigate={() => setSheetOpen(false)} />
				</SheetContent>
			</Sheet>
			<div className="flex min-h-svh min-w-0 flex-col lg:pl-60 lg:group-data-rail/shell:pl-14">
				<Toolbar
					rail={rail}
					onToggleRail={toggleRail}
					onShowSidebar={() => setSheetOpen(true)}
					onSearch={() => command.setOpen(true)}
				/>
				<main
					data-page=""
					className="mx-auto flex w-full min-w-0 max-w-[1400px] flex-1 flex-col px-4 pb-16 xl:px-8"
				>
					<Outlet />
				</main>
			</div>
			{command.wanted && (
				<Suspense fallback={null}>
					<CommandMenu open={command.open} onOpenChange={command.setOpen} />
				</Suspense>
			)}
		</div>
	);
}
