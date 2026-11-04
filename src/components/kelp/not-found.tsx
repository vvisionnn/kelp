import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { KelpMark } from "./brand.tsx";
import { Reveal } from "./page.tsx";

/** Shown for any address Kelp has no page for. */
export function NotFound() {
	return (
		<main className="flex min-h-svh items-center justify-center bg-background px-6">
			<Reveal className="flex max-w-sm flex-col items-center gap-4 text-center">
				<span className="flex size-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
					<KelpMark className="size-8" />
				</span>
				<h1 className="font-semibold text-2xl tracking-tight [font-stretch:92%]">
					Nothing lives at this address
				</h1>
				<p className="text-muted-foreground text-sm">
					The page may have moved, or the item it showed was deleted. Check the address, or start again from
					the overview.
				</p>
				<Button render={<Link to="/" />}>Go to the overview</Button>
			</Reveal>
		</main>
	);
}
