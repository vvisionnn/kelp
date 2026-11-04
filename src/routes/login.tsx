import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { z } from "zod";
import { AmbientRays } from "@/components/kelp/ambient.tsx";
import { Wordmark } from "@/components/kelp/brand.tsx";
import RotatingText from "@/components/react-bits/RotatingText.tsx";
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
		<main className="relative isolate flex min-h-svh flex-col overflow-hidden bg-background">
			<div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
				<AmbientRays
					color={resolvedTheme === "dark" ? "#c9e6ff" : "#2f86e0"}
					light={resolvedTheme === "light"}
					className="size-full"
				/>
				<div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-background to-transparent" />
			</div>

			<header className="flex h-16 items-center px-6 sm:px-10">
				<Wordmark className="text-[17px]" />
			</header>

			<section className="flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
				<h1 className="font-[450] text-4xl leading-[1.05] tracking-[-0.035em] sm:text-6xl">
					<span className="block">One console for every</span>
					<RotatingText
						texts={["bucket", "volume", "shard", "access key", "topic", "table"]}
						rotationInterval={2400}
						staggerDuration={0.02}
						staggerFrom="last"
						mainClassName="mt-1 inline-flex overflow-hidden rounded-full bg-[image:var(--spectrum)] bg-clip-text px-1 pb-1 text-transparent"
					/>
				</h1>
				<p className="mt-5 max-w-md text-[17px] text-muted-foreground">
					Sign in to manage your SeaweedFS cluster.
				</p>

				<form
					onSubmit={submit}
					className="mt-10 w-full max-w-sm rounded-3xl bg-card/70 p-6 text-left shadow-(--float-shadow) backdrop-blur-xl sm:p-7"
				>
					<FieldGroup className="gap-4">
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
						<Button type="submit" size="lg" disabled={signIn.isPending} className="mt-2 w-full">
							{signIn.isPending && <Spinner />}
							Sign in
						</Button>
					</FieldGroup>
				</form>
			</section>
		</main>
	);
}
