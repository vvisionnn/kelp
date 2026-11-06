import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { z } from "zod";
import { AmbientRays } from "@/components/kelp/ambient.tsx";
import { KelpMark } from "@/components/kelp/brand.tsx";
import { useTheme } from "@/components/theme-provider.tsx";
import { Button } from "@/components/ui/button";
import { sessionQuery, useSignIn } from "@/lib/session.ts";

export const Route = createFileRoute("/login")({
	validateSearch: z.object({ redirect: z.string().optional() }),
	beforeLoad: async ({ context }) => {
		const user = await context.queryClient.fetchQuery(sessionQuery).catch(() => undefined);
		if (user) throw redirect({ to: "/" });
	},
	component: LoginPage,
});

/** Only allow in-app paths as post-login destinations. */
export function safeRedirect(target: string | undefined): string {
	return target?.startsWith("/") && !target.startsWith("//") ? target : "/";
}

function LoginPage() {
	const { redirect: target } = Route.useSearch();
	const navigate = useNavigate();
	const signIn = useSignIn();
	const { resolvedTheme } = useTheme();
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");

	function submit(event: FormEvent) {
		event.preventDefault();
		signIn.mutate({ username, password }, { onSuccess: () => navigate({ to: safeRedirect(target) as "/" }) });
	}

	return (
		<main className="relative isolate flex min-h-svh flex-col items-center justify-center overflow-hidden bg-background px-6 py-12">
			<div className="pointer-events-none absolute inset-0 -z-10 opacity-60" aria-hidden="true">
				<AmbientRays
					color={resolvedTheme === "dark" ? "#a5a3ff" : "#6366f1"}
					light={resolvedTheme === "light"}
					className="size-full"
				/>
			</div>

			<div className="w-full max-w-[340px] text-center">
				<span className="mx-auto flex size-16 items-center justify-center rounded-[18px] bg-[linear-gradient(180deg,#2c2c2e,#0e0e10)] text-white shadow-[inset_0_0_0_0.5px_rgb(255_255_255/0.14),0_8px_24px_rgb(0_0_0/0.25)]">
					<KelpMark className="size-10" />
				</span>
				<h1 className="mt-5 font-bold text-[26px] leading-8 tracking-[-0.022em]">Sign in to Kelp</h1>
				<p className="mt-1 text-[14px] text-muted-foreground">Manage your SeaweedFS cluster.</p>

				<form onSubmit={submit} className="mt-8 text-left">
					<div className="group-sheet divide-y divide-border overflow-hidden">
						<input
							id="username"
							aria-label="Username"
							placeholder="Username"
							autoComplete="username"
							// biome-ignore lint/a11y/noAutofocus: the sign-in page has one job; focus starts where typing does.
							autoFocus
							required
							value={username}
							onChange={(e) => setUsername(e.target.value)}
							className="block h-11 w-full bg-transparent px-4 text-[15px] outline-none placeholder:text-tertiary focus-visible:bg-primary/5"
						/>
						<input
							id="password"
							type="password"
							aria-label="Password"
							placeholder="Password"
							autoComplete="current-password"
							required
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							className="block h-11 w-full bg-transparent px-4 text-[15px] outline-none placeholder:text-tertiary focus-visible:bg-primary/5"
						/>
					</div>
					{signIn.error && (
						<p role="alert" className="mt-3 px-1 text-[13px] text-destructive">
							{signIn.error.message}
						</p>
					)}
					<Button
						type="submit"
						size="lg"
						disabled={signIn.isPending}
						className="mt-4 w-full rounded-full"
						pending={signIn.isPending}
					>
						Sign in
					</Button>
				</form>
			</div>
			<p className="absolute bottom-6 text-[12px] text-tertiary">Kelp for SeaweedFS</p>
		</main>
	);
}
