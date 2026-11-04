import { useNavigate } from "@tanstack/react-router";
import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@/components/ui/command";
import { useSignOut } from "@/lib/session.ts";
import { useTheme } from "../theme-provider.tsx";
import { NAV } from "./nav.ts";
import { Tile } from "./tile.tsx";

/** Open state for the command menu, toggled with ⌘K / Ctrl+K anywhere in the app. */
export function useCommandMenu() {
	const [open, setOpen] = useState(false);
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
	return { open, setOpen };
}

export function CommandMenu({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const navigate = useNavigate();
	const { setTheme } = useTheme();
	const signOut = useSignOut();

	const run = (action: () => void) => {
		onOpenChange(false);
		action();
	};

	return (
		<CommandDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Search Kelp"
			description="Jump to a page or run an action"
		>
			<Command>
				<CommandInput placeholder="Search pages and actions" />
				<CommandList>
					<CommandEmpty>Nothing matches that.</CommandEmpty>
					{NAV.map((section) => (
						<CommandGroup key={section.title} heading={section.title}>
							{section.items.map((item) => (
								<CommandItem
									key={item.to}
									value={`${item.title} ${item.keywords ?? ""}`}
									onSelect={() => run(() => navigate({ to: item.to as "/" }))}
								>
									<Tile item={item} />
									{item.title}
								</CommandItem>
							))}
						</CommandGroup>
					))}
					<CommandSeparator />
					<CommandGroup heading="Preferences">
						<CommandItem value="theme light" onSelect={() => run(() => setTheme("light"))}>
							<Sun />
							Use light theme
						</CommandItem>
						<CommandItem value="theme dark" onSelect={() => run(() => setTheme("dark"))}>
							<Moon />
							Use dark theme
						</CommandItem>
						<CommandItem value="theme system" onSelect={() => run(() => setTheme("system"))}>
							<Monitor />
							Match system theme
						</CommandItem>
						<CommandItem
							value="sign out logout"
							onSelect={() =>
								run(() => signOut.mutate(undefined, { onSettled: () => navigate({ to: "/login" }) }))
							}
						>
							<LogOut />
							Sign out
						</CommandItem>
					</CommandGroup>
				</CommandList>
			</Command>
		</CommandDialog>
	);
}
