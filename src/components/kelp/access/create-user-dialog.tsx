import type { CreateUserRequest, CreateUserResponse, NewSecret } from "@shared/iam.ts";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ACCESS_KEY, accessQueries, BUILT_IN_ACTIONS } from "@/lib/access-queries.ts";
import { api } from "@/lib/api.ts";
import { useAction } from "@/lib/mutations.ts";
import { NewSecretPanel } from "./new-secret.tsx";
import { TokenField } from "./token-field.tsx";

/** Creates a user, optionally with a first access key whose secret is shown once. */
export function CreateUserDialog() {
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const [username, setUsername] = useState("");
	const [email, setEmail] = useState("");
	const [actions, setActions] = useState<string[]>(["Read", "List"]);
	const [policies, setPolicies] = useState<string[]>([]);
	const [generateKey, setGenerateKey] = useState(true);
	const [secret, setSecret] = useState<{ username: string; key: NewSecret } | null>(null);
	const policyNames = useQuery({
		...accessQueries.policies(),
		enabled: open,
		select: (p) => p.map((x) => x.name),
	});
	const endpoint = useQuery({ ...accessQueries.s3Endpoint(), enabled: open });

	const create = useAction({
		run: (body: CreateUserRequest) => api.post<CreateUserResponse>("/iam/users", body),
		success: (_, body) => `User ${body.username} created`,
		invalidate: [[...ACCESS_KEY]],
		onSuccess: (result) => {
			if (result.key) setSecret({ username: result.user.username, key: result.key });
			else finish(result.user.username);
		},
	});

	function reset() {
		setUsername("");
		setEmail("");
		setActions(["Read", "List"]);
		setPolicies([]);
		setGenerateKey(true);
		setSecret(null);
		create.reset();
	}

	function finish(name: string) {
		setOpen(false);
		reset();
		navigate({ to: "/access/users/$username", params: { username: name } });
	}

	function submit(event: FormEvent) {
		event.preventDefault();
		create.mutate({ username: username.trim(), email: email.trim(), actions, policies, generateKey });
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				// Never let a click outside discard a secret that has not been copied yet.
				if (!next && secret) return;
				setOpen(next);
				if (!next) reset();
			}}
		>
			<DialogTrigger render={<Button />}>
				<UserPlus />
				Create user
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg" showCloseButton={!secret}>
				<DialogHeader>
					<DialogTitle>{secret ? `Access key for ${secret.username}` : "Create user"}</DialogTitle>
					<DialogDescription>
						{secret
							? "The user can sign S3 requests with this key pair."
							: "Users sign S3 requests with their access keys. Grant access with actions, policies or groups."}
					</DialogDescription>
				</DialogHeader>
				{secret ? (
					<NewSecretPanel
						secret={secret.key}
						endpoint={endpoint.data ?? null}
						onDone={() => finish(secret.username)}
					/>
				) : (
					<form onSubmit={submit} className="grid gap-4">
						<Field>
							<FieldLabel htmlFor="new-username">Username</FieldLabel>
							<Input
								id="new-username"
								value={username}
								onChange={(event) => setUsername(event.target.value)}
								autoComplete="off"
								required
								className="font-mono"
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="new-email">Email</FieldLabel>
							<Input
								id="new-email"
								type="email"
								value={email}
								onChange={(event) => setEmail(event.target.value)}
								placeholder="Optional"
							/>
						</Field>
						<TokenField
							label="Actions"
							value={actions}
							onChange={setActions}
							suggestions={[...BUILT_IN_ACTIONS]}
							mono
							description="Add a bucket after a colon to limit an action, such as Write:media."
						/>
						<TokenField
							label="Policies"
							value={policies}
							onChange={setPolicies}
							suggestions={policyNames.data ?? []}
							placeholder="Attach managed policies"
						/>
						<Field orientation="horizontal">
							<Switch id="new-generate-key" checked={generateKey} onCheckedChange={setGenerateKey} />
							<div className="grid gap-0.5">
								<FieldLabel htmlFor="new-generate-key">Create an access key now</FieldLabel>
								<FieldDescription>You can add more keys later.</FieldDescription>
							</div>
						</Field>
						<DialogFooter>
							<Button type="submit" disabled={!username.trim() || create.isPending}>
								{create.isPending && <Spinner />}
								Create user
							</Button>
						</DialogFooter>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}
