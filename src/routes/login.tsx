import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { z } from "zod";
import { AmbientThreads } from "@/components/kelp/ambient-threads.tsx";
import { Wordmark } from "@/components/kelp/brand.tsx";
import BlurText from "@/components/react-bits/BlurText.tsx";
import { useTheme } from "@/components/theme-provider.tsx";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
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
		<main className="relative grid min-h-svh overflow-hidden bg-background lg:grid-cols-[minmax(26rem,34rem)_1fr]">
			<div className="pointer-events-none absolute inset-0 lg:left-[30%]" aria-hidden="true">
				<AmbientThreads color={resolvedTheme === "dark" ? "#3dd6bc" : "#0e8f80"} className="size-full" />
				<div className="absolute inset-0 bg-gradient-to-r from-background via-background/40 to-transparent" />
			</div>

			<section className="relative z-10 flex flex-col justify-between gap-12 px-8 py-10 sm:px-14">
				<Wordmark className="text-lg" />

				<div className="max-w-sm">
					<BlurText
						text="Your storage, in one calm place."
						animateBy="words"
						trigger="load"
						delay={90}
						className="font-semibold text-4xl leading-[1.08] tracking-tight [font-stretch:88%] sm:text-[2.75rem]"
					/>
					<p className="mt-4 text-muted-foreground">Sign in to manage your SeaweedFS cluster.</p>

					<form onSubmit={submit} className="mt-10">
						<FieldGroup className="gap-5">
							<Field>
								<FieldLabel htmlFor="username">Username</FieldLabel>
								<Input
									id="username"
									autoComplete="username"
									autoFocus
									required
									value={username}
									onChange={(e) => setUsername(e.target.value)}
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="password">Password</FieldLabel>
								<Input
									id="password"
									type="password"
									autoComplete="current-password"
									required
									value={password}
									onChange={(e) => setPassword(e.target.value)}
								/>
							</Field>
							{signIn.error && <FieldError>{signIn.error.message}</FieldError>}
							<Button type="submit" size="lg" disabled={signIn.isPending} className="mt-1">
								{signIn.isPending && <Spinner />}
								Sign in
							</Button>
						</FieldGroup>
					</form>
				</div>

				<p className="text-muted-foreground text-xs">Kelp for SeaweedFS</p>
			</section>
		</main>
	);
}
