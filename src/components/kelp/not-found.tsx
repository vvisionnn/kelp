import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { KelpMark } from "./brand.tsx";
import { Reveal } from "./page.tsx";

/** Shown for any address Kelp has no page for. */
export function NotFound() {
	return (
		<main className="relative isolate flex min-h-svh items-center justify-center overflow-hidden bg-background px-6">
			<Reveal className="flex max-w-sm flex-col items-center gap-3 text-center">
				<span className="flex size-14 items-center justify-center rounded-2xl bg-[linear-gradient(180deg,#2c2c2e,#0e0e10)] text-white">
					<KelpMark className="size-9" />
				</span>
				<h1 className="mt-2 font-bold text-[22px] leading-7 tracking-[-0.02em]">
					Nothing lives at this address
				</h1>
				<p className="text-[14px] text-muted-foreground">
					The page may have moved, or the item it showed was deleted. Check the address, or start again from
					the overview.
				</p>
				<Button className="mt-2" render={<Link to="/" />}>
					Go to the overview
				</Button>
			</Reveal>
		</main>
	);
}
