import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { KelpMark } from "./brand.tsx";
import { Reveal } from "./page.tsx";

/** Shown for any address Kelp has no page for. */
export function NotFound() {
	return (
		<main className="relative isolate flex min-h-svh items-center justify-center overflow-hidden bg-background px-6">
			<div className="area-glow h-full!" aria-hidden="true" />
			<Reveal className="flex max-w-md flex-col items-center gap-5 text-center">
				<KelpMark className="size-10" />
				<h1 className="text-balance font-[450] text-4xl leading-[1.05] tracking-[-0.03em] sm:text-5xl">
					Nothing lives at this address
				</h1>
				<p className="text-[17px] text-muted-foreground">
					The page may have moved, or the item it showed was deleted. Check the address, or start again from
					the overview.
				</p>
				<Button size="lg" className="mt-2" render={<Link to="/" />}>
					Go to the overview
				</Button>
			</Reveal>
		</main>
	);
}
