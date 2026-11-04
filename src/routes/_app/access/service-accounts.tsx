import type {
	CreateServiceAccountRequest,
	CreateServiceAccountResponse,
	NewSecret,
	ServiceAccount,
	UpdateServiceAccountRequest,
} from "@shared/iam.ts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Bot, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { z } from "zod";
import { KeyStatusBadge } from "@/components/kelp/access/badges.tsx";
import { NewSecretPanel } from "@/components/kelp/access/new-secret.tsx";
import { ConfirmDialog } from "@/components/kelp/confirm-dialog.tsx";
import { CopyButton } from "@/components/kelp/copy-button.tsx";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import { EmptyState, PageHeader, Reveal } from "@/components/kelp/page.tsx";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ACCESS_KEY, accessQueries } from "@/lib/access-queries.ts";
import { api } from "@/lib/api.ts";
import { formatDateTime, formatRelative } from "@/lib/format.ts";
import { useAction } from "@/lib/mutations.ts";
import { useCanWrite } from "@/lib/session.ts";

export const Route = createFileRoute("/_app/access/service-accounts")({
	staticData: { section: "Access", title: "Service accounts" },
	validateSearch: z.object({ account: z.string().optional() }),
	loader: ({ context }) => void context.queryClient.prefetchQuery(accessQueries.serviceAccounts()),
	component: ServiceAccountsPage,
});

const invalidate = [[...ACCESS_KEY]];
const DAY = 86_400_000;
export const EXPIRY_PRESETS = [
	{ value: "never", label: "Never", days: 0 },
	{ value: "30", label: "In 30 days", days: 30 },
	{ value: "90", label: "In 90 days", days: 90 },
	{ value: "365", label: "In a year", days: 365 },
	{ value: "custom", label: "On a date", days: 0 },
] as const;

/** Turns an expiry choice into an ISO timestamp, or undefined for "never". */
export function expiryFrom(choice: string, customDate: string, now = Date.now()): string | undefined {
	if (choice === "custom") return customDate ? new Date(`${customDate}T23:59:59`).toISOString() : undefined;
	const preset = EXPIRY_PRESETS.find((p) => p.value === choice);
	return preset?.days ? new Date(now + preset.days * DAY).toISOString() : undefined;
}

/** "Never", "Expired 3 days ago" or "in 2 months", for the expiry column. */
export function describeExpiry(
	expiresAt: string | null,
	now = Date.now(),
): { text: string; expired: boolean } {
	if (!expiresAt) return { text: "Never", expired: false };
	const expired = new Date(expiresAt).getTime() <= now;
	return { text: expired ? `Expired ${formatRelative(expiresAt)}` : formatRelative(expiresAt), expired };
}

const columns: Array<Column<ServiceAccount>> = [
	{
		id: "account",
		accessorFn: (a) => a.description || a.id,
		header: "Service account",
		cell: ({ row }) => (
			<div className="min-w-0">
				<p className="truncate font-medium">{row.original.description || "No description"}</p>
				<p className="truncate font-mono text-muted-foreground text-xs">{row.original.id}</p>
			</div>
		),
		size: 260,
	},
	{
		accessorKey: "parentUser",
		header: "Acts as",
		cell: ({ row }) => <span className="font-mono">{row.original.parentUser}</span>,
	},
	{
		accessorKey: "accessKey",
		header: "Access key",
		cell: ({ row }) => <span className="font-mono text-xs">{row.original.accessKey}</span>,
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => <KeyStatusBadge status={row.original.status} />,
	},
	{
		id: "expires",
		accessorFn: (a) => a.expiresAt ?? "9999",
		header: "Expires",
		cell: ({ row }) => {
			const { text, expired } = describeExpiry(row.original.expiresAt);
			return (
				<span className={expired ? "text-destructive text-xs" : "text-muted-foreground text-xs"}>{text}</span>
			);
		},
	},
];

function ExpiryField({
	choice,
	onChoice,
	date,
	onDate,
	label = "Expires",
}: {
	choice: string;
	onChoice: (value: string) => void;
	date: string;
	onDate: (value: string) => void;
	label?: string;
}) {
	return (
		<Field>
			<FieldLabel>{label}</FieldLabel>
			<Select value={choice} onValueChange={(value) => onChoice(value as string)}>
				<SelectTrigger aria-label={label} className="w-full">
					<SelectValue>{(value: string) => EXPIRY_PRESETS.find((p) => p.value === value)?.label}</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{EXPIRY_PRESETS.map((preset) => (
						<SelectItem key={preset.value} value={preset.value}>
							{preset.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{choice === "custom" && (
				<Input type="date" aria-label="Expiry date" value={date} onChange={(e) => onDate(e.target.value)} />
			)}
		</Field>
	);
}

function CreateServiceAccountDialog() {
	const [open, setOpen] = useState(false);
	const [parentUser, setParentUser] = useState("");
	const [description, setDescription] = useState("");
	const [choice, setChoice] = useState("never");
	const [date, setDate] = useState("");
	const [secret, setSecret] = useState<NewSecret | null>(null);
	const users = useQuery({
		...accessQueries.users(),
		enabled: open,
		select: (l) => l.map((u) => u.username),
	});
	const endpoint = useQuery({ ...accessQueries.s3Endpoint(), enabled: open });
	const create = useAction({
		run: (body: CreateServiceAccountRequest) =>
			api.post<CreateServiceAccountResponse>("/iam/service-accounts", body),
		success: "Service account created",
		invalidate,
		onSuccess: (result) => setSecret(result.key),
	});
	function close() {
		setOpen(false);
		setParentUser("");
		setDescription("");
		setChoice("never");
		setDate("");
		setSecret(null);
		create.reset();
	}
	function submit(event: FormEvent) {
		event.preventDefault();
		const expiresAt = expiryFrom(choice, date);
		create.mutate({ parentUser, description: description.trim(), ...(expiresAt ? { expiresAt } : {}) });
	}
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next && secret) return;
				if (next) setOpen(true);
				else close();
			}}
		>
			<DialogTrigger render={<Button />}>
				<Plus />
				Create service account
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg" showCloseButton={!secret}>
				<DialogHeader>
					<DialogTitle>{secret ? "Service account created" : "Create service account"}</DialogTitle>
					<DialogDescription>
						{secret
							? "Give these credentials to the automation that needs them."
							: "A service account has its own key and acts with its user's permissions. Revoke it without touching the user."}
					</DialogDescription>
				</DialogHeader>
				{secret ? (
					<NewSecretPanel secret={secret} endpoint={endpoint.data ?? null} onDone={close} />
				) : (
					<form onSubmit={submit} className="grid gap-4">
						<Field>
							<FieldLabel>Acts as</FieldLabel>
							<Select
								value={parentUser || null}
								onValueChange={(value) => setParentUser((value as string) ?? "")}
							>
								<SelectTrigger aria-label="Acts as" className="w-full">
									<SelectValue placeholder="Choose a user" />
								</SelectTrigger>
								<SelectContent>
									{(users.data ?? []).map((name) => (
										<SelectItem key={name} value={name}>
											{name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
						<Field>
							<FieldLabel htmlFor="sa-description">Description</FieldLabel>
							<Input
								id="sa-description"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="What uses it, e.g. nightly backups"
							/>
						</Field>
						<ExpiryField choice={choice} onChoice={setChoice} date={date} onDate={setDate} />
						<DialogFooter>
							<Button
								type="submit"
								disabled={!parentUser || create.isPending || (choice === "custom" && !date)}
							>
								{create.isPending && <Spinner />}
								Create service account
							</Button>
						</DialogFooter>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}

function AccountSheet({ account, onClose }: { account: ServiceAccount; onClose: () => void }) {
	const canWrite = useCanWrite();
	const path = `/iam/service-accounts/${encodeURIComponent(account.id)}`;
	const [description, setDescription] = useState(account.description);
	const [choice, setChoice] = useState("keep");
	const [date, setDate] = useState("");
	const update = useAction({
		run: (body: UpdateServiceAccountRequest) => api.put(path, body),
		success: "Service account updated",
		invalidate,
	});
	const remove = useAction({
		run: () => api.delete(path),
		success: "Service account deleted",
		invalidate,
		onSuccess: onClose,
	});
	const expiry = describeExpiry(account.expiresAt);
	const newExpiry = choice === "keep" ? undefined : expiryFrom(choice, date);
	const dirty = description.trim() !== account.description || newExpiry !== undefined;

	return (
		<SheetContent className="sm:max-w-md">
			<SheetHeader>
				<SheetTitle>{account.description || "Service account"}</SheetTitle>
				<SheetDescription className="font-mono text-xs">{account.id}</SheetDescription>
			</SheetHeader>
			<div className="grid gap-5 px-4">
				<dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
					<dt className="text-muted-foreground">Acts as</dt>
					<dd>
						<Link
							to="/access/users/$username"
							params={{ username: account.parentUser }}
							className="font-mono hover:underline"
						>
							{account.parentUser}
						</Link>
					</dd>
					<dt className="text-muted-foreground">Access key</dt>
					<dd className="flex items-center gap-1 font-mono text-xs">
						{account.accessKey}
						<CopyButton value={account.accessKey} label="Copy access key" />
					</dd>
					<dt className="text-muted-foreground">Created</dt>
					<dd>{formatDateTime(account.createdAt)}</dd>
					<dt className="text-muted-foreground">Expires</dt>
					<dd className={expiry.expired ? "text-destructive" : ""}>
						{account.expiresAt
							? `${formatDateTime(account.expiresAt)}${expiry.expired ? " (expired)" : ""}`
							: "Never"}
					</dd>
				</dl>
				{canWrite ? (
					<>
						<div className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
							<label htmlFor="account-active">
								<span className="block font-medium">Active</span>
								<span className="text-muted-foreground text-xs">Inactive accounts cannot sign requests.</span>
							</label>
							<Switch
								id="account-active"
								checked={account.status === "Active"}
								disabled={update.isPending}
								onCheckedChange={(checked) => update.mutate({ status: checked ? "Active" : "Inactive" })}
							/>
						</div>
						<form
							className="grid gap-4"
							onSubmit={(event) => {
								event.preventDefault();
								update.mutate({
									description: description.trim(),
									...(newExpiry ? { expiresAt: newExpiry } : {}),
								});
							}}
						>
							<Field>
								<FieldLabel htmlFor="sheet-description">Description</FieldLabel>
								<Input
									id="sheet-description"
									value={description}
									onChange={(e) => setDescription(e.target.value)}
								/>
							</Field>
							<Field>
								<FieldLabel>Change expiry</FieldLabel>
								<Select value={choice} onValueChange={(value) => setChoice(value as string)}>
									<SelectTrigger aria-label="Change expiry" className="w-full">
										<SelectValue>
											{(value: string) =>
												value === "keep"
													? "Keep current"
													: EXPIRY_PRESETS.find((p) => p.value === value)?.label
											}
										</SelectValue>
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="keep">Keep current</SelectItem>
										{EXPIRY_PRESETS.filter((p) => p.value !== "never").map((preset) => (
											<SelectItem key={preset.value} value={preset.value}>
												{preset.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{choice === "custom" && (
									<Input
										type="date"
										aria-label="Expiry date"
										value={date}
										onChange={(e) => setDate(e.target.value)}
									/>
								)}
								<FieldDescription>
									SeaweedFS cannot remove an expiry once set; move it out instead.
								</FieldDescription>
							</Field>
							<Button type="submit" disabled={!dirty || update.isPending}>
								{update.isPending && <Spinner />}
								Save changes
							</Button>
						</form>
					</>
				) : (
					<p className="text-muted-foreground text-sm">Status: {account.status}</p>
				)}
			</div>
			{canWrite && (
				<SheetFooter>
					<ConfirmDialog
						trigger={
							<Button variant="destructive">
								<Trash2 />
								Delete service account
							</Button>
						}
						title="Delete this service account?"
						description="Its key stops working immediately. This cannot be undone."
						confirmLabel="Delete service account"
						destructive
						onConfirm={() => remove.mutateAsync()}
					/>
				</SheetFooter>
			)}
		</SheetContent>
	);
}

function ServiceAccountsPage() {
	const { account: selectedId } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const canWrite = useCanWrite();
	const { data, isPending, error, refetch } = useQuery(accessQueries.serviceAccounts());
	const selected = data?.find((a) => a.id === selectedId);
	const select = (id: string | undefined) => navigate({ search: id ? { account: id } : {} });

	return (
		<>
			<PageHeader
				title="Service accounts"
				description="Keys for automation that act on a user's behalf and can be revoked on their own."
				actions={canWrite && <CreateServiceAccountDialog />}
			/>
			<Reveal>
				<DataTable
					data={data}
					isLoading={isPending}
					error={error}
					onRetry={() => refetch()}
					getRowId={(a) => a.id}
					searchText={(a) => `${a.id} ${a.description} ${a.parentUser} ${a.accessKey}`}
					searchPlaceholder="Search accounts, users or keys"
					onRowClick={(a) => select(a.id)}
					empty={
						<EmptyState
							icon={<Bot />}
							title="No service accounts"
							description="Create one for CI jobs, backups or anything that should not use a person's key."
							{...(canWrite ? { action: <CreateServiceAccountDialog /> } : {})}
						/>
					}
					columns={columns}
				/>
			</Reveal>
			<Sheet open={Boolean(selected)} onOpenChange={(open) => !open && select(undefined)}>
				{selected && <AccountSheet key={selected.id} account={selected} onClose={() => select(undefined)} />}
			</Sheet>
		</>
	);
}
