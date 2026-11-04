import { type QueryClient, useIsFetching, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useMatches, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { LogOut, Monitor, Moon, Search, Sun } from "lucide-react";
import { motion } from "motion/react";
import { Fragment, type ReactNode, useEffect } from "react";
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
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarRail,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import { UNAUTHORIZED_EVENT } from "@/lib/api.ts";
import { sessionQuery, useSession, useSignOut } from "@/lib/session.ts";
import { type Theme, useTheme } from "../theme-provider.tsx";
import { KelpMark } from "./brand.tsx";
import { CommandMenu, useCommandMenu } from "./command-menu.tsx";
import { NAV } from "./nav.ts";

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

function AppSidebar() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	return (
		<Sidebar collapsible="icon" variant="inset">
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" render={<Link to="/" />} tooltip="Kelp">
							<span className="flex size-8 items-center justify-center rounded-lg bg-primary/12 text-primary">
								<KelpMark className="size-5" />
							</span>
							<span className="grid leading-tight">
								<span className="font-semibold tracking-tight">Kelp</span>
								<span className="text-sidebar-foreground/60 text-xs">SeaweedFS console</span>
							</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				{NAV.map((section) => (
					<SidebarGroup key={section.title}>
						<SidebarGroupLabel>{section.title}</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{section.items.map((item) => {
									const active = isActivePath(pathname, item.to);
									return (
										<SidebarMenuItem key={item.to}>
											<SidebarMenuButton
												isActive={active}
												tooltip={item.title}
												render={<Link to={item.to as "/"} />}
												className="relative"
											>
												{active && (
													<motion.span
														layoutId="nav-active"
														className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-sidebar-primary"
														transition={{ type: "spring", stiffness: 500, damping: 40 }}
													/>
												)}
												<item.icon />
												<span>{item.title}</span>
											</SidebarMenuButton>
										</SidebarMenuItem>
									);
								})}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				))}
			</SidebarContent>
			<SidebarFooter>
				<UserMenu />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
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
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<SidebarMenuButton size="lg" aria-label="Account menu">
								<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent font-medium text-sm uppercase">
									{user.name.slice(0, 1)}
								</span>
								<span className="grid leading-tight">
									<span className="truncate font-medium">{user.name}</span>
									<span className="text-sidebar-foreground/60 text-xs">
										{user.role === "admin" ? "Administrator" : "Read-only"}
									</span>
								</span>
							</SidebarMenuButton>
						}
					/>
					<DropdownMenuContent side="top" align="start" className="w-56">
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
			</SidebarMenuItem>
		</SidebarMenu>
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

function PageBreadcrumb() {
	const matches = useMatches();
	const leaf = [...matches].reverse().find((m) => m.staticData?.title);
	const section = leaf?.staticData?.section;
	const title = leaf?.staticData?.title;
	const queryClient = useQueryClient();
	// Re-render when fetches settle so names that come from loaded data appear.
	useIsFetching();
	const params = (leaf?.params ?? {}) as Record<string, string>;
	const detail = leaf?.staticData?.crumb?.(params, queryClient) ?? Object.values(params)[0];
	const crumbs = [
		{ level: "section", text: section },
		{ level: "title", text: title },
		{ level: "detail", text: detail },
	].filter((crumb): crumb is { level: string; text: string } => Boolean(crumb.text));
	return (
		<Breadcrumb>
			<BreadcrumbList>
				{crumbs.map(({ level, text }, index) => (
					<Fragment key={level}>
						{index > 0 && <BreadcrumbSeparator />}
						<BreadcrumbItem>
							{index === crumbs.length - 1 ? (
								<BreadcrumbPage className="max-w-64 truncate">{text}</BreadcrumbPage>
							) : (
								<span className="text-muted-foreground">{text}</span>
							)}
						</BreadcrumbItem>
					</Fragment>
				))}
			</BreadcrumbList>
		</Breadcrumb>
	);
}

/** A thin tide line under the top bar while any data is loading in the background. */
function FetchIndicator() {
	const fetching = useIsFetching() > 0;
	return (
		<div className="absolute inset-x-0 bottom-0 h-px overflow-hidden" aria-hidden="true">
			{fetching && <div className="tide h-full w-full bg-primary/40" />}
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

export function AppShell() {
	useSessionWatcher();
	const command = useCommandMenu();
	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="min-w-0">
				<header className="relative flex h-14 shrink-0 items-center gap-3 px-4">
					<SidebarTrigger className="-ml-1" />
					<PageBreadcrumb />
					<div className="ml-auto flex items-center gap-1">
						<Button
							variant="outline"
							size="sm"
							className="hidden w-56 justify-between text-muted-foreground sm:flex"
							onClick={() => command.setOpen(true)}
						>
							<span className="flex items-center gap-2">
								<Search />
								Search
							</span>
							<Kbd>⌘K</Kbd>
						</Button>
						<ThemeSwitch />
					</div>
					<FetchIndicator />
				</header>
				<div className="flex min-w-0 flex-1 flex-col px-4 pt-2 pb-10 sm:px-6">
					<Outlet />
				</div>
			</SidebarInset>
			<CommandMenu open={command.open} onOpenChange={command.setOpen} />
		</SidebarProvider>
	);
}
