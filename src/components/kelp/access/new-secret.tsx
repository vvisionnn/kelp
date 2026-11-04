import type { NewSecret } from "@shared/iam.ts";
import { KeyRound, ShieldAlert } from "lucide-react";
import { motion } from "motion/react";
import DecryptedText from "@/components/react-bits/DecryptedText.tsx";
import { Button } from "@/components/ui/button";
import { CopyButton } from "../copy-button.tsx";
import { usePrefersReducedMotion } from "../motion.ts";

function SecretRow({ label, value }: { label: string; value: string }) {
	const reduced = usePrefersReducedMotion();
	return (
		<div className="grid gap-1">
			<span className="text-muted-foreground text-xs">{label}</span>
			<div className="flex items-center gap-2 rounded-lg border bg-muted/40 py-1.5 pr-1.5 pl-3">
				<span className="min-w-0 flex-1 break-all font-mono text-sm" data-testid={label}>
					{reduced ? (
						value
					) : (
						<DecryptedText
							text={value}
							animateOn="view"
							sequential
							speed={18}
							revealDirection="start"
							characters="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
							encryptedClassName="text-primary/70"
						/>
					)}
				</span>
				<CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
			</div>
		</div>
	);
}

/**
 * Shows a freshly created key pair. SeaweedFS never returns the secret again, so this is the
 * moment to copy it; the panel says so plainly and offers a ready-to-paste environment snippet.
 */
export function NewSecretPanel({
	secret,
	endpoint,
	onDone,
	doneLabel = "I saved the secret",
}: {
	secret: NewSecret;
	endpoint?: string | null;
	onDone: () => void;
	doneLabel?: string;
}) {
	const env = [
		`AWS_ACCESS_KEY_ID=${secret.accessKey}`,
		`AWS_SECRET_ACCESS_KEY=${secret.secretKey}`,
		...(endpoint ? [`AWS_ENDPOINT_URL=${endpoint}`] : []),
	].join("\n");
	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
			className="grid gap-4"
		>
			<div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
				<ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
				<p>Copy the secret now. SeaweedFS will not show it again; if it is lost, create a new key.</p>
			</div>
			<SecretRow label="Access key" value={secret.accessKey} />
			<SecretRow label="Secret key" value={secret.secretKey} />
			<div className="flex items-center justify-between gap-2 text-muted-foreground text-xs">
				<span className="flex items-center gap-1.5">
					<KeyRound className="size-3.5" />
					Copy both as environment variables
				</span>
				<CopyButton value={env} label="Copy as environment variables" />
			</div>
			<Button onClick={onDone}>{doneLabel}</Button>
		</motion.div>
	);
}
