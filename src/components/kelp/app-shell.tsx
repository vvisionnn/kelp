import { type QueryClient, useIsFetching, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useMatches, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { LogOut, Monitor, Moon, Search, Sun } from "lucide-react";
import { motion } from "motion/react";
import { type ComponentProps, type CSSProperties, Fragment, type ReactNode, useEffect } from "react";
import PillNav from "@/components/react-bits/PillNav.tsx";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
import { UNAUTHORIZED_EVENT } from "@/lib/api.ts";
import { sessionQuery, useSession, useSignOut } from "@/lib/session.ts";
import { cn } from "@/lib/utils";
import { type Theme, useTheme } from "../theme-provider.tsx";
import { KelpMark } from "./brand.tsx";
import { CommandMenu, useCommandMenu } from "./command-menu.tsx";
import { NAV, type NavSection, sectionFor } from "./nav.ts";

declare module "@tanstack/react-router" {
	interface StaticDataRouteOption {
		/** Section shown before the page title in the breadcrumb. */
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

/** The deepest route with a title: it names the page and, through its section, the area. */
function useLeaf() {
	const matches = useMatches();
	return [...matches].reverse().find((m) => m.staticData?.title);
}

/** Adapts PillNav's `href` links to the router. */
function RouterLink({ href, ...props }: ComponentProps<"a"> & { href: string }) {
	return <Link to={href as "/"} {...props} />;
}

/** Glass and pill colors for PillNav in Kelp's palette (white pill on dark, ink pill on light). */
const PILL_COLORS: Record<"light" | "dark", CSSProperties> = {
	dark: {
		"--pn-surface": "rgba(26, 26, 26, 0.72)",
		"--pn-text": "rgba(231, 233, 238, 0.62)",
		"--pn-strong": "#ffffff",
		"--pn-pill": "#ffffff",
		"--pn-pill-ink": "#0a0a0a",
	} as CSSProperties,
	light: {
		"--pn-surface": "rgba(242, 243, 247, 0.85)",
		"--pn-text": "rgba(10, 10, 10, 0.6)",
		"--pn-strong": "#0a0a0a",
		"--pn-pill": "#0a0a0a",
		"--pn-pill-ink": "#ffffff",
	} as CSSProperties,
};

function AreaNav({ current }: { current: NavSection }) {
	const { resolvedTheme } = useTheme();
	return (
		<PillNav
			items={NAV.map((section) => ({ label: section.title, href: section.items[0]?.to ?? "/" }))}
			activeHref={current.items[0]?.to}
			linkComponent={RouterLink}
			theme={resolvedTheme}
			style={PILL_COLORS[resolvedTheme]}
			size="sm"
			itemStyle="plain"
			hoverEffect="glide"
			indicator="pill"
			ariaLabel="Areas"
		/>
	);
}

/** The current area's pages as pills under the top bar. */
function SectionNav({ section }: { section: NavSection }) {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	if (section.items.length < 2) return null;
	return (
		<nav aria-label={section.title} className="-mx-1 flex gap-1 overflow-x-auto px-1 py-3">
			{section.items.map((item) => {
				const active = isActivePath(pathname, item.to);
				return (
					<Link
						key={item.to}
						to={item.to as "/"}
						data-active={active ? "" : undefined}
						className="relative flex h-8 shrink-0 items-center gap-2 rounded-full px-3.5 text-[13px] text-foreground/60 transition-colors hover:text-foreground data-active:text-foreground [&_svg]:size-3.5"
					>
						{active && (
							<motion.span
								layoutId="section-nav-active"
								className="absolute inset-0 -z-10 rounded-full bg-secondary"
								transition={{ type: "spring", stiffness: 500, damping: 40 }}
							/>
						)}
						<item.icon />
						{item.title}
					</Link>
				);
			})}
		</nav>
	);
}

const THEMES: Array<{ value: Theme; label: string; icon: ReactNode }> = [
	{ value: "system", label: "System", icon: <Monitor /> },
	{ value: "light", label: "Light", icon: <Sun /> },
	{ value: "dark", label: "Dark", icon: <Moon /> },
];

function UserMenu() {
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
						className="flex h-9 items-center gap-2 rounded-full bg-secondary py-1 pr-3.5 pl-1 text-[13px] transition-colors hover:bg-accent"
					>
						<span className="flex size-7 items-center justify-center rounded-full bg-[image:var(--spectrum)] font-medium text-white text-xs uppercase">
							{user.name.slice(0, 1)}
						</span>
						<span className="hidden max-w-28 truncate font-medium sm:block">{user.name}</span>
					</button>
				}
			/>
			<DropdownMenuContent align="end" className="w-60">
				<DropdownMenuGroup>
					<DropdownMenuLabel className="flex flex-col gap-0.5">
						<span className="truncate font-medium text-foreground text-sm">{user.name}</span>
						<span>{user.role === "admin" ? "Administrator" : "Read-only"}</span>
					</DropdownMenuLabel>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuLabel>Theme</DropdownMenuLabel>
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
		<Button variant="ghost" size="icon" aria-label={`Switch to ${next} theme`} onClick={() => setTheme(next)}>
			<motion.span
				key={resolvedTheme}
				initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
				animate={{ rotate: 0, opacity: 1, scale: 1 }}
				transition={{ type: "spring", stiffness: 400, damping: 22 }}
				className="flex"
			>
				{resolvedTheme === "dark" ? <Moon /> : <Sun />}
			</motion.span>
		</Button>
	);
}

/** On detail pages, the trail back to the list the item came from. */
function DetailBreadcrumb() {
	const leaf = useLeaf();
	const queryClient = useQueryClient();
	// Re-render when fetches settle so names that come from loaded data appear.
	useIsFetching();
	const params = (leaf?.params ?? {}) as Record<string, string>;
	const detail = leaf?.staticData?.crumb?.(params, queryClient) ?? Object.values(params)[0];
	if (!detail) return null;
	const crumbs = [leaf?.staticData?.section, leaf?.staticData?.title].filter(Boolean) as string[];
	return (
		<Breadcrumb className="pt-4">
			<BreadcrumbList>
				{crumbs.map((text) => (
					<Fragment key={text}>
						<BreadcrumbItem>
							<span className="text-muted-foreground">{text}</span>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
					</Fragment>
				))}
				<BreadcrumbItem>
					<BreadcrumbPage className="max-w-64 truncate">{detail}</BreadcrumbPage>
				</BreadcrumbItem>
			</BreadcrumbList>
		</Breadcrumb>
	);
}

/** The spectrum hairline under the top bar while any data is loading in the background. */
function FetchIndicator() {
	const fetching = useIsFetching() > 0;
	return (
		<div className="absolute inset-x-0 bottom-0 h-px overflow-hidden" aria-hidden="true">
			{fetching && <div className="spectrum h-full w-full animate-pulse" />}
		</div>
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

/** Kelp's page width: 1232px of content, as on x.ai. */
export const CONTAINER = "mx-auto w-full max-w-[1280px] px-4 sm:px-6";

export function AppShell() {
	useSessionWatcher();
	const command = useCommandMenu();
	const section = sectionFor(useLeaf()?.staticData?.section);
	return (
		<div data-area={section.area} className="relative isolate flex min-h-svh flex-col">
			<div className="area-glow" aria-hidden="true" />
			<header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl">
				<div className={cn(CONTAINER, "flex h-16 items-center gap-3")}>
					<Link
						to="/"
						className="flex shrink-0 items-center gap-2 rounded-full pr-2 font-semibold tracking-tight"
					>
						<KelpMark className="size-7" />
						<span className="hidden text-[17px] md:block">Kelp</span>
					</Link>
					<div className="flex min-w-0 flex-1 justify-center">
						<AreaNav current={section} />
					</div>
					<div className="flex shrink-0 items-center gap-1.5">
						<Button
							variant="secondary"
							size="sm"
							aria-label="Search"
							className="w-9 px-0 text-muted-foreground sm:w-auto sm:pr-1.5 sm:pl-3.5"
							onClick={() => command.setOpen(true)}
						>
							<Search />
							<span className="hidden sm:inline">Search</span>
							<Kbd className="ml-3 hidden rounded-full sm:inline-flex">⌘K</Kbd>
						</Button>
						<ThemeSwitch />
						<UserMenu />
					</div>
				</div>
				<div className="hairline-b" />
				<FetchIndicator />
			</header>
			<main className={cn(CONTAINER, "flex min-w-0 flex-1 flex-col pb-24")}>
				<SectionNav section={section} />
				<DetailBreadcrumb />
				<Outlet />
			</main>
			<CommandMenu open={command.open} onOpenChange={command.setOpen} />
		</div>
	);
}
