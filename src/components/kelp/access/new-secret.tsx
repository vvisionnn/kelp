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
		<div className="flex min-h-11 items-center gap-3 px-3.5 py-2">
			<span className="w-20 shrink-0 text-[13px] text-muted-foreground">{label}</span>
			<span className="min-w-0 flex-1 break-all font-mono text-[12px] leading-[18px]" data-testid={label}>
				{reduced ? (
					value
				) : (
					<DecryptedText
						text={value}
						animateOn="view"
						sequential
						speed={14}
						revealDirection="start"
						characters="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
						encryptedClassName="text-tertiary"
					/>
				)}
			</span>
			<CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
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
			initial={{ opacity: 0, y: 4 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
			className="grid gap-3"
		>
			<p className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2.5 text-[13px]">
				<ShieldAlert className="mt-px size-4 shrink-0 text-warning" />
				<span>Copy the secret now. SeaweedFS will not show it again; if it is lost, create a new key.</span>
			</p>
			<div className="divide-y divide-border rounded-lg bg-raised">
				<SecretRow label="Access key" value={secret.accessKey} />
				<SecretRow label="Secret key" value={secret.secretKey} />
				<div className="flex min-h-11 items-center justify-between gap-2 px-3.5 py-2 text-[13px] text-muted-foreground">
					<span className="flex items-center gap-1.5">
						<KeyRound className="size-3.5" />
						Copy both as environment variables
					</span>
					<CopyButton value={env} label="Copy as environment variables" />
				</div>
			</div>
			<Button onClick={onDone} className="mt-1 w-full">
				{doneLabel}
			</Button>
		</motion.div>
	);
}
