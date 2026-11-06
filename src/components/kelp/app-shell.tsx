import { type QueryClient, useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useMatches, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { ChevronLeft, ChevronsUpDown, LogOut, Monitor, Moon, PanelLeft, Search, Sun } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import GradualBlur from "@/components/react-bits/GradualBlur.tsx";
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
import { UNAUTHORIZED_EVENT } from "@/lib/api.ts";
import { healthSummary } from "@/lib/health.ts";
import { queries } from "@/lib/queries.ts";
import { sessionQuery, useSession, useSignOut } from "@/lib/session.ts";
import { cn } from "@/lib/utils";
import { type Theme, useTheme } from "../theme-provider.tsx";
import { KelpMark } from "./brand.tsx";
import { CommandMenu, useCommandMenu } from "./command-menu.tsx";
import { SPRING } from "./motion.ts";
import { itemFor, NAV } from "./nav.ts";
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

function ClusterStatus() {
	const { data } = useQuery(queries.overview());
	const health = data ? healthSummary(data) : undefined;
	const color = { good: "bg-success", warn: "bg-warning", bad: "bg-destructive" }[health?.tone ?? "good"];
	return (
		<span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
			<span
				className={cn(
					"size-1.5 shrink-0 rounded-full transition-colors duration-500",
					health ? color : "bg-tertiary",
				)}
			/>
			<span className="truncate">
				<TextMorph>
					{`${health ? health.text.split(".")[0] : "Connecting"}${data ? `, SeaweedFS ${data.versions.version.split(" ")[0] || ""}` : ""}`}
				</TextMorph>
			</span>
		</span>
	);
}

/** Sidebar contents, shared by the floating sidebar and the compact-width sheet. */
function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const current = itemFor(pathname);
	const [hovered, setHovered] = useState<string | null>(null);
	return (
		<div className="flex h-full min-h-0 flex-col">
			<Link
				to="/"
				onClick={onNavigate}
				className="mx-2 mt-2 flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-accent/60"
			>
				<span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-[linear-gradient(180deg,#2c2c2e,#0e0e10)] text-white shadow-[inset_0_0_0_0.5px_rgb(255_255_255/0.12),0_1px_2px_rgb(0_0_0/0.2)]">
					<KelpMark className="size-5" />
				</span>
				<span className="grid min-w-0 leading-tight">
					<span className="font-semibold text-[15px] tracking-[-0.01em]">Kelp</span>
					<ClusterStatus />
				</span>
			</Link>

			<nav
				aria-label="Pages"
				className="mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto px-2 pb-3"
				onPointerLeave={() => setHovered(null)}
			>
				{NAV.map((section) => (
					<div key={section.title}>
						{section.title !== "Overview" && (
							<p className="px-2.5 pb-1 font-medium text-[11px] text-muted-foreground tracking-[0.01em]">
								{section.title}
							</p>
						)}
						<ul className="space-y-px">
							{section.items.map((item) => {
								const active = current?.to === item.to;
								return (
									<li key={item.to}>
										<Link
											to={item.to as "/"}
											onClick={onNavigate}
											onPointerEnter={() => setHovered(item.to)}
											data-active={active ? "" : undefined}
											aria-current={active ? "page" : undefined}
											className="group/nav relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] text-foreground/80 transition-colors hover:text-foreground data-active:font-medium data-active:text-foreground"
										>
											<AnimatePresence>
												{hovered === item.to && !active && (
													<motion.span
														layoutId="sidebar-hover"
														className="absolute inset-0 -z-10 rounded-md bg-accent/60"
														initial={{ opacity: 0 }}
														animate={{ opacity: 1 }}
														exit={{ opacity: 0 }}
														transition={SPRING}
													/>
												)}
											</AnimatePresence>
											{active && (
												<motion.span
													layoutId="sidebar-active"
													className="absolute inset-0 -z-10 rounded-md bg-accent"
													transition={SPRING}
												>
													<span className="absolute inset-y-2 -left-2 w-[3px] rounded-full bg-[linear-gradient(180deg,#6366f1,#a855f7,#ec4899,#f97316)]" />
												</motion.span>
											)}
											<item.icon
												className="size-4 shrink-0 text-muted-foreground transition-colors group-data-active/nav:text-foreground"
												strokeWidth={1.75}
											/>
											<span className="truncate">{item.title}</span>
										</Link>
									</li>
								);
							})}
						</ul>
					</div>
				))}
			</nav>

			<div className="border-border border-t p-2">
				<AccountMenu />
			</div>
		</div>
	);
}

const THEMES: Array<{ value: Theme; label: string; icon: ReactNode }> = [
	{ value: "system", label: "Automatic", icon: <Monitor /> },
	{ value: "light", label: "Light", icon: <Sun /> },
	{ value: "dark", label: "Dark", icon: <Moon /> },
];

function AccountMenu() {
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
						className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-accent/60 aria-expanded:bg-accent"
					>
						<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(180deg,#8e8e93,#636366)] font-semibold text-[12px] text-white uppercase">
							{user.name.slice(0, 1)}
						</span>
						<span className="grid min-w-0 flex-1 leading-tight">
							<span className="truncate font-medium text-[13px]">{user.name}</span>
							<span className="text-[11px] text-muted-foreground">
								{user.role === "admin" ? "Administrator" : "Read-only"}
							</span>
						</span>
						<ChevronsUpDown className="size-3.5 text-muted-foreground" />
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

/** True once the page has scrolled far enough that its large title is out of view. */
function useScrolledPast(offset: number): boolean {
	const [past, setPast] = useState(false);
	useEffect(() => {
		const update = () => setPast(window.scrollY > offset);
		update();
		window.addEventListener("scroll", update, { passive: true });
		return () => window.removeEventListener("scroll", update);
	}, [offset]);
	return past;
}

/**
 * The page's toolbar. On detail pages it leads with a back button to the list; the title appears
 * once the page's own large title scrolls away, as in Apple's apps.
 */
function Toolbar({ onShowSidebar, onSearch }: { onShowSidebar: () => void; onSearch: () => void }) {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const leaf = useLeaf();
	const item = itemFor(pathname);
	const detail = useDetailName();
	const scrolled = useScrolledPast(56);
	const fetching = useIsFetching() > 0;
	const title = detail ?? leaf?.staticData?.title;
	return (
		<header
			data-toolbar=""
			className={cn(
				"sticky top-0 z-30 transition-[background-color,box-shadow] duration-200",
				scrolled &&
					"bg-[var(--glass)] shadow-[0_0.5px_0_var(--border)] backdrop-blur-xl backdrop-saturate-[1.8]",
			)}
		>
			<div className="flex h-13 items-center gap-2 px-4 xl:px-8">
				<Button
					variant="ghost"
					size="icon"
					aria-label="Show sidebar"
					className="text-muted-foreground lg:hidden"
					onClick={onShowSidebar}
				>
					<PanelLeft />
				</Button>
				{detail && item && (
					<Link
						to={item.to as "/"}
						className="-ml-1 flex h-7 shrink-0 items-center gap-0.5 rounded-md pr-2 pl-1 text-[13px] text-primary hover:bg-accent/60"
					>
						<ChevronLeft className="size-4" />
						{item.title}
					</Link>
				)}
				<motion.p
					initial={false}
					animate={{ opacity: scrolled ? 1 : 0, y: scrolled ? 0 : 4 }}
					transition={{ duration: 0.18 }}
					aria-hidden={!scrolled}
					className="min-w-0 truncate font-semibold text-[15px] tracking-[-0.01em]"
				>
					{title ? <TextMorph>{title}</TextMorph> : null}
				</motion.p>
				<div className="ml-auto flex shrink-0 items-center gap-1">
					<button
						type="button"
						aria-label="Search"
						onClick={onSearch}
						className="flex h-8 items-center gap-2 rounded-md bg-secondary px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent sm:w-56"
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
	return (
		<div className="min-h-svh">
			<aside className="glass fixed inset-y-2 left-2 z-40 hidden w-62 rounded-xl lg:block">
				<SidebarBody />
			</aside>
			<Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
				<SheetContent
					side="left"
					showCloseButton={false}
					className="w-72 gap-0 bg-background p-0 sm:max-w-72"
				>
					<SheetTitle className="sr-only">Pages</SheetTitle>
					<SidebarBody onNavigate={() => setSheetOpen(false)} />
				</SheetContent>
			</Sheet>
			<div className="flex min-h-svh min-w-0 flex-col lg:pl-66">
				<Toolbar onShowSidebar={() => setSheetOpen(true)} onSearch={() => command.setOpen(true)} />
				<main
					data-page=""
					className="mx-auto flex w-full min-w-0 max-w-[1400px] flex-1 flex-col px-4 pb-16 xl:px-8"
				>
					<Outlet />
				</main>
				{/* Pages sink softly under the bottom edge, and the edge clears at the end of the page. */}
				<div className="pointer-events-none sticky bottom-0 z-20 h-0" aria-hidden="true">
					<GradualBlur
						target="page"
						position="bottom"
						height="3.5rem"
						strength={1.25}
						autoHide
						style={{ position: "absolute" }}
					/>
				</div>
			</div>
			<CommandMenu open={command.open} onOpenChange={command.setOpen} />
		</div>
	);
}
