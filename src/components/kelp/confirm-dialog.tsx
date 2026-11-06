import { type ReactElement, type ReactNode, useId, useState } from "react";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ConfirmDialogProps {
	/** The element that opens the dialog. */
	trigger: ReactElement;
	title: string;
	description: ReactNode;
	/** Names the action, e.g. "Delete bucket". */
	confirmLabel: string;
	destructive?: boolean;
	/** When set, the user must type this exact text first. Use for irreversible deletes. */
	typeToConfirm?: string;
	onConfirm: () => Promise<unknown> | unknown;
}

/** Asks before doing something consequential; stays open with a spinner until the action settles. */
export function ConfirmDialog({
	trigger,
	title,
	description,
	confirmLabel,
	destructive = false,
	typeToConfirm,
	onConfirm,
}: ConfirmDialogProps) {
	const [open, setOpen] = useState(false);
	const [typed, setTyped] = useState("");
	const [busy, setBusy] = useState(false);
	const inputId = useId();
	const ready = !typeToConfirm || typed === typeToConfirm;

	async function confirm() {
		setBusy(true);
		try {
			await onConfirm();
			setOpen(false);
		} catch {
			// The action reports its own error; keep the dialog open so the user can retry.
		} finally {
			setBusy(false);
		}
	}

	return (
		<AlertDialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) setTyped("");
			}}
		>
			<AlertDialogTrigger render={trigger} />
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				{typeToConfirm && (
					<div className="grid gap-1.5 text-sm">
						<label htmlFor={inputId}>
							Type <span className="font-mono font-medium">{typeToConfirm}</span> to confirm
						</label>
						<Input
							id={inputId}
							value={typed}
							onChange={(event) => setTyped(event.target.value)}
							autoComplete="off"
						/>
					</div>
				)}
				<AlertDialogFooter>
					<AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
					<Button
						variant={destructive ? "destructive" : "default"}
						disabled={!ready || busy}
						onClick={confirm}
						pending={busy}
					>
						{confirmLabel}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
