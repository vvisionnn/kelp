import type { ObjectLockMode } from "@shared/objects.ts";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, useId, useState } from "react";
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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/lib/mutations.ts";
import { objectApi, objectKeys, objectQueries } from "@/lib/objects-queries.ts";
import {
	bucketNameProblem,
	QuotaInput,
	type QuotaValue,
	quotaBytes,
	quotaIsValid,
} from "./bucket-fields.tsx";

const NO_OWNER = "__none__";

/** Picks an S3 identity as bucket owner; "No owner" keeps the bucket admin-only. */
export function OwnerSelect({
	value,
	onChange,
	disabled,
	id,
}: {
	value: string;
	onChange: (owner: string) => void;
	disabled?: boolean;
	id?: string;
}) {
	const { data: owners = [] } = useQuery(objectQueries.owners());
	const choices = value && !owners.includes(value) ? [value, ...owners] : owners;
	return (
		<Select
			value={value || NO_OWNER}
			disabled={disabled}
			onValueChange={(next) => onChange(next === NO_OWNER ? "" : String(next))}
		>
			<SelectTrigger id={id} aria-label="Owner" className="w-full">
				<SelectValue>
					{(selected: string) => (selected === NO_OWNER ? "No owner (admins only)" : selected)}
				</SelectValue>
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={NO_OWNER}>No owner (admins only)</SelectItem>
				{choices.map((owner) => (
					<SelectItem key={owner} value={owner}>
						{owner}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

const LOCK_MODES: Array<{ value: ObjectLockMode; label: string; description: string }> = [
	{
		value: "GOVERNANCE",
		label: "Governance",
		description: "Protects versions, but administrators can still remove them.",
	},
	{
		value: "COMPLIANCE",
		label: "Compliance",
		description: "Nobody can remove a protected version until its retention ends.",
	},
];

export function CreateBucketDialog() {
	const navigate = useNavigate();
	const id = useId();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [touched, setTouched] = useState(false);
	const [owner, setOwner] = useState("");
	const [quota, setQuota] = useState<QuotaValue>({ enabled: false, size: 10, unit: "GiB" });
	const [versioning, setVersioning] = useState(false);
	const [lock, setLock] = useState(false);
	const [mode, setMode] = useState<ObjectLockMode>("GOVERNANCE");
	const [retention, setRetention] = useState<number | null>(null);

	const create = useAction({
		run: objectApi.createBucket,
		success: (_out, input) => `Bucket ${input.name} created`,
		invalidate: [objectKeys.buckets],
		onSuccess: (_out, input) => {
			setOpen(false);
			navigate({ to: "/buckets/$bucket", params: { bucket: input.name } });
		},
	});

	const problem = bucketNameProblem(name);
	const valid = !problem && quotaIsValid(quota) && (retention === null || retention > 0);

	function reset() {
		setName("");
		setTouched(false);
		setOwner("");
		setQuota({ enabled: false, size: 10, unit: "GiB" });
		setVersioning(false);
		setLock(false);
		setMode("GOVERNANCE");
		setRetention(null);
	}

	function submit(event: FormEvent) {
		event.preventDefault();
		setTouched(true);
		if (!valid) return;
		create.mutate({
			name,
			owner,
			quotaBytes: quota.enabled ? quotaBytes(quota) : null,
			versioning: versioning || lock,
			objectLock: lock ? { mode, retentionDays: retention } : null,
		});
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) reset();
			}}
		>
			<DialogTrigger render={<Button />}>
				<Plus />
				Create bucket
			</DialogTrigger>
			<DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
				<form onSubmit={submit} className="grid gap-5">
					<DialogHeader>
						<DialogTitle>Create bucket</DialogTitle>
						<DialogDescription>
							Buckets hold objects for S3 clients. The name cannot change later.
						</DialogDescription>
					</DialogHeader>

					<Field data-invalid={touched && problem ? true : undefined}>
						<FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
						<Input
							id={`${id}-name`}
							value={name}
							autoComplete="off"
							spellCheck={false}
							className="font-mono"
							placeholder="team-assets"
							aria-invalid={touched && problem ? true : undefined}
							onBlur={() => setTouched(true)}
							onChange={(event) => setName(event.target.value.toLowerCase())}
						/>
						{touched && problem ? (
							<FieldError>{problem}</FieldError>
						) : (
							<FieldDescription>Lowercase letters, numbers, dots and hyphens.</FieldDescription>
						)}
					</Field>

					<Field>
						<FieldLabel htmlFor={`${id}-owner`}>Owner</FieldLabel>
						<OwnerSelect id={`${id}-owner`} value={owner} onChange={setOwner} />
						<FieldDescription>The S3 identity that owns the bucket and its objects.</FieldDescription>
					</Field>

					<QuotaInput value={quota} onChange={setQuota} />

					<div className="flex items-center justify-between gap-4">
						<label htmlFor={`${id}-versioning`} className="grid gap-0.5">
							<span className="font-medium text-sm">Keep every version</span>
							<span className="text-muted-foreground text-xs">
								Overwrites and deletes keep the previous version.
							</span>
						</label>
						<Switch
							id={`${id}-versioning`}
							checked={versioning || lock}
							disabled={lock}
							onCheckedChange={setVersioning}
						/>
					</div>

					<div className="grid gap-3 rounded-lg border p-3">
						<div className="flex items-center justify-between gap-4">
							<label htmlFor={`${id}-lock`} className="grid gap-0.5">
								<span className="font-medium text-sm">Object lock</span>
								<span className="text-muted-foreground text-xs">
									Write-once storage. Can only be turned on now, at creation.
								</span>
							</label>
							<Switch id={`${id}-lock`} checked={lock} onCheckedChange={setLock} />
						</div>
						<AnimatePresence initial={false}>
							{lock && (
								<motion.div
									initial={{ height: 0, opacity: 0 }}
									animate={{ height: "auto", opacity: 1 }}
									exit={{ height: 0, opacity: 0 }}
									transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
									className="grid gap-3 overflow-hidden"
								>
									<RadioGroup
										aria-label="Lock mode"
										value={mode}
										onValueChange={(value) => setMode(value as ObjectLockMode)}
										className="grid gap-2"
									>
										{LOCK_MODES.map((option) => (
											<label
												key={option.value}
												htmlFor={`${id}-${option.value}`}
												className="flex cursor-pointer items-start gap-3 rounded-md border p-2.5 has-data-checked:border-primary/50 has-data-checked:bg-primary/5"
											>
												<RadioGroupItem
													id={`${id}-${option.value}`}
													value={option.value}
													className="mt-0.5"
												/>
												<span className="grid gap-0.5">
													<span className="font-medium text-sm">{option.label}</span>
													<span className="text-muted-foreground text-xs">{option.description}</span>
												</span>
											</label>
										))}
									</RadioGroup>
									<Field>
										<FieldLabel htmlFor={`${id}-retention`}>Default retention (days)</FieldLabel>
										<Input
											id={`${id}-retention`}
											type="number"
											min={1}
											inputMode="numeric"
											className="tabular"
											placeholder="None"
											value={retention ?? ""}
											onChange={(event) =>
												setRetention(event.target.value === "" ? null : event.target.valueAsNumber)
											}
										/>
										<FieldDescription>
											New objects are protected this long. Leave empty to set it per object.
										</FieldDescription>
									</Field>
								</motion.div>
							)}
						</AnimatePresence>
					</div>

					<DialogFooter>
						<Button type="submit" disabled={create.isPending || (touched && !valid)}>
							{create.isPending && <Spinner />}
							Create bucket
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
