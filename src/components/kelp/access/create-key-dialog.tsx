import type { AccessKeyInfo, CreateAccessKeyRequest, NewSecret } from "@shared/iam.ts";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, KeyRound } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { ACCESS_KEY, accessQueries } from "@/lib/access-queries.ts";
import { api } from "@/lib/api.ts";
import { useAction } from "@/lib/mutations.ts";
import { TextMorph } from "../text-morph.tsx";
import { Swap } from "../transitions.tsx";
import { Expand } from "./loading.tsx";
import { NewSecretPanel } from "./new-secret.tsx";

/** Adds an access key to a user. SeaweedFS generates the pair unless the admin brings their own. */
export function CreateKeyDialog({ username }: { username: string }) {
	const [open, setOpen] = useState(false);
	const [custom, setCustom] = useState(false);
	const [accessKey, setAccessKey] = useState("");
	const [secretKey, setSecretKey] = useState("");
	const [secret, setSecret] = useState<NewSecret | null>(null);
	const endpoint = useQuery({ ...accessQueries.s3Endpoint(), enabled: open });

	const create = useAction({
		run: (body: CreateAccessKeyRequest) =>
			api.post<{ accessKey: AccessKeyInfo; key: NewSecret | null }>(
				`/iam/users/${encodeURIComponent(username)}/keys`,
				body,
			),
		success: (result) => `Access key ${result.accessKey.accessKey} created`,
		invalidate: [[...ACCESS_KEY]],
		onSuccess: (result) => {
			if (result.key) setSecret(result.key);
			else setOpen(false);
		},
	});

	function reset() {
		setCustom(false);
		setAccessKey("");
		setSecretKey("");
		setSecret(null);
		create.reset();
	}

	function submit(event: FormEvent) {
		event.preventDefault();
		create.mutate(custom ? { accessKey: accessKey.trim(), secretKey } : {});
	}

	const customIncomplete = custom && (!accessKey.trim() || secretKey.length < 8);

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next && secret) return;
				setOpen(next);
			}}
			// Cleared only once closed, so the form never flashes back while the secret fades out.
			onOpenChangeComplete={(next) => !next && reset()}
		>
			<DialogTrigger render={<Button size="sm" variant="outline" />}>
				<KeyRound />
				Create access key
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg" showCloseButton={!secret}>
				<DialogHeader>
					<DialogTitle>
						<TextMorph>{secret ? "New access key" : `Create an access key for ${username}`}</TextMorph>
					</DialogTitle>
					<DialogDescription>
						{secret
							? "Hand these to the app that signs requests as this user."
							: "Keys sign S3 requests. Each one can be turned off or deleted on its own."}
					</DialogDescription>
				</DialogHeader>
				<Swap id={secret ? "secret" : "form"}>
					{secret ? (
						<NewSecretPanel secret={secret} endpoint={endpoint.data ?? null} onDone={() => setOpen(false)} />
					) : (
						<form onSubmit={submit} className="grid gap-4">
							<Collapsible open={custom} onOpenChange={setCustom}>
								<CollapsibleTrigger
									render={
										<Button type="button" variant="ghost" size="sm" className="-ml-2 text-muted-foreground" />
									}
								>
									<ChevronRight
										className={custom ? "rotate-90 transition-transform" : "transition-transform"}
									/>
									Use my own key pair
								</CollapsibleTrigger>
								<Expand open={custom}>
									<div className="grid gap-3 pt-2">
										<Field>
											<FieldLabel htmlFor="custom-access-key">Access key</FieldLabel>
											<Input
												id="custom-access-key"
												value={accessKey}
												onChange={(event) => setAccessKey(event.target.value)}
												className="font-mono"
												autoComplete="off"
											/>
										</Field>
										<Field>
											<FieldLabel htmlFor="custom-secret-key">Secret key</FieldLabel>
											<Input
												id="custom-secret-key"
												type="password"
												value={secretKey}
												onChange={(event) => setSecretKey(event.target.value)}
												className="font-mono"
												autoComplete="new-password"
											/>
											<FieldDescription>8 to 128 characters.</FieldDescription>
										</Field>
									</div>
								</Expand>
							</Collapsible>
							<DialogFooter>
								<Button
									type="submit"
									disabled={create.isPending || customIncomplete}
									pending={create.isPending}
								>
									Create access key
								</Button>
							</DialogFooter>
						</form>
					)}
				</Swap>
			</DialogContent>
		</Dialog>
	);
}
