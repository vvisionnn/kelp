import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { isStaleBuildError, reloadForNewBuild } from "@/lib/stale-build.ts";
import { KelpMark } from "./brand.tsx";

/**
 * What a page shows when it fails to render. A page whose code belongs to an older build reloads
 * into the current one on its own; anything else says what happened and offers a fresh start.
 */
export function RouteError({
	error,
	reload = () => window.location.reload(),
}: {
	error: unknown;
	reload?: () => void;
}) {
	const reloading = isStaleBuildError(error);
	useEffect(() => {
		if (reloading) reloadForNewBuild(reload);
	}, [reloading, reload]);
	return (
		<div role="alert" className="flex flex-1 items-center justify-center py-24">
			<div className="flex max-w-sm flex-col items-center gap-3 text-center">
				<span className="flex size-12 items-center justify-center rounded-2xl bg-[linear-gradient(180deg,#2c2c2e,#0e0e10)] text-white">
					<KelpMark className="size-8" />
				</span>
				<h1 className="mt-1 font-bold text-[20px] leading-7 tracking-[-0.02em]">
					{reloading ? "Kelp was updated" : "This page could not be shown"}
				</h1>
				<p className="text-[14px] text-muted-foreground">
					{reloading
						? "Loading the new version. If this page stays, reload it."
						: error instanceof Error
							? error.message
							: "Something unexpected went wrong while drawing this page."}
				</p>
				<Button className="mt-1" onClick={reload}>
					Reload
				</Button>
			</div>
		</div>
	);
}
