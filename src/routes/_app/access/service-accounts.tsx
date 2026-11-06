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
import { expiryTimeline } from "@/components/kelp/access/analysis.ts";
import { KeyStatusBadge } from "@/components/kelp/access/badges.tsx";
import { Avatar } from "@/components/kelp/access/identity.tsx";
import {
	BarsGhost,
	ColumnsGhost,
	Expand,
	SmallRingGhost,
	TableGhost,
	TextGhost,
	TileGhost,
} from "@/components/kelp/access/loading.tsx";
import { NewSecretPanel } from "@/components/kelp/access/new-secret.tsx";
import { BarList, Columns, dataColor, Kpi, Ring } from "@/components/kelp/charts/index.ts";
import { ConfirmDialog } from "@/components/kelp/confirm-dialog.tsx";
import { CopyButton } from "@/components/kelp/copy-button.tsx";
import { type Column, DataTable } from "@/components/kelp/data-table.tsx";
import { EmptyState, InfoList, PageHeader, Panel } from "@/components/kelp/page.tsx";
import { LoadingRegion } from "@/components/kelp/skeletons.tsx";
import { RollingValue, TextMorph } from "@/components/kelp/text-morph.tsx";
import { Loaded, Swap } from "@/components/kelp/transitions.tsx";
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
import { Switch } from "@/components/ui/switch";
import { ACCESS_KEY, accessQueries } from "@/lib/access-queries.ts";
import { api } from "@/lib/api.ts";
import { formatDateTime, formatRelative } from "@/lib/format.ts";
import { useAction } from "@/lib/mutations.ts";
import { text } from "@/lib/search.ts";
import { useCanWrite } from "@/lib/session.ts";

export const Route = createFileRoute("/_app/access/service-accounts")({
	staticData: { section: "Access", title: "Service accounts" },
	validateSearch: (raw: Record<string, unknown>): { account?: string } => ({ account: text(raw.account) }),
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

/** Headline numbers for the service accounts page, with expiry as the thing to watch. */
export function accountStats(accounts: ServiceAccount[], now = Date.now()) {
	const expiry = (a: ServiceAccount) =>
		a.expiresAt ? new Date(a.expiresAt).getTime() : Number.POSITIVE_INFINITY;
	return [
		{ label: "Service accounts", value: accounts.length },
		{ label: "Can sign", value: accounts.filter((a) => a.status === "Active" && expiry(a) > now).length },
		{
			label: "Expire within 30 days",
			value: accounts.filter((a) => expiry(a) > now && expiry(a) <= now + 30 * DAY).length,
		},
		{ label: "Already expired", value: accounts.filter((a) => expiry(a) <= now).length },
	];
}

const columns: Array<Column<ServiceAccount>> = [
	{
		id: "account",
		accessorFn: (a) => a.description || a.id,
		header: "Service account",
		cell: ({ row }) => (
			<div className="flex min-w-0 items-center gap-3">
				<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground [&_svg]:size-3.5">
					<Bot />
				</span>
				<div className="min-w-0">
					<p className="truncate font-medium">{row.original.description || "No description"}</p>
					<p className="truncate font-mono text-[12px] text-muted-foreground">{row.original.id}</p>
				</div>
			</div>
		),
		size: 300,
	},
	{
		accessorKey: "parentUser",
		header: "Acts as",
		cell: ({ row }) => (
			<span className="flex items-center gap-2">
				<Avatar name={row.original.parentUser} />
				{row.original.parentUser}
			</span>
		),
	},
	{
		accessorKey: "accessKey",
		header: "Access key",
		cell: ({ row }) => <span className="font-mono text-[12px]">{row.original.accessKey}</span>,
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
				<span className={expired ? "text-[12px] text-destructive" : "text-[12px] text-muted-foreground"}>
					{text}
				</span>
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
			<Expand open={choice === "custom"}>
				<Input type="date" aria-label="Expiry date" value={date} onChange={(e) => onDate(e.target.value)} />
			</Expand>
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
	function reset() {
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
				setOpen(next);
			}}
			// Cleared only once closed, so the form never flashes back while the secret fades out.
			onOpenChangeComplete={(next) => !next && reset()}
		>
			<DialogTrigger render={<Button />}>
				<Plus />
				Create service account
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg" showCloseButton={!secret}>
				<DialogHeader>
					<DialogTitle>
						<TextMorph>{secret ? "Service account created" : "Create service account"}</TextMorph>
					</DialogTitle>
					<DialogDescription>
						{secret
							? "Give these credentials to the automation that needs them."
							: "A service account has its own key and acts with its user's permissions. Revoke it without touching the user."}
					</DialogDescription>
				</DialogHeader>
				<Swap id={secret ? "secret" : "form"}>
					{secret ? (
						<NewSecretPanel secret={secret} endpoint={endpoint.data ?? null} onDone={() => setOpen(false)} />
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
									pending={create.isPending}
								>
									Create service account
								</Button>
							</DialogFooter>
						</form>
					)}
				</Swap>
			</DialogContent>
		</Dialog>
	);
}

function AccountSheet({ account, onClose }: { account: ServiceAccount; onClose: () => void }) {
	return (
		<SheetContent className="bg-background sm:max-w-md">
			<AccountDetails key={account.id} account={account} onClose={onClose} />
		</SheetContent>
	);
}

/** Lives inside the sheet's popup, so an abandoned draft goes when the sheet does. */
function AccountDetails({ account, onClose }: { account: ServiceAccount; onClose: () => void }) {
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
		<>
			<SheetHeader className="flex-row items-center gap-3 px-4 pt-4 pb-0">
				<span className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-[#7d7aff] text-white">
					<Bot className="size-5" />
				</span>
				<div className="min-w-0">
					<SheetTitle className="truncate font-bold text-[17px] tracking-[-0.012em]">
						{account.description || "Service account"}
					</SheetTitle>
					<SheetDescription className="truncate font-mono text-[12px]">{account.id}</SheetDescription>
				</div>
			</SheetHeader>
			<div className="grid gap-5 overflow-y-auto px-4 pb-4">
				<InfoList
					items={[
						{
							label: "Acts as",
							value: (
								<Link
									to="/access/users/$username"
									params={{ username: account.parentUser }}
									className="font-mono hover:underline"
								>
									{account.parentUser}
								</Link>
							),
						},
						{
							label: "Access key",
							value: (
								<span className="flex items-center justify-end gap-1 font-mono text-[12px]">
									{account.accessKey}
									<CopyButton value={account.accessKey} label="Copy access key" />
								</span>
							),
						},
						{ label: "Created", value: formatDateTime(account.createdAt) },
						{
							label: "Expires",
							value: (
								<span className={expiry.expired ? "text-destructive" : ""}>
									{account.expiresAt
										? `${formatDateTime(account.expiresAt)}${expiry.expired ? " (expired)" : ""}`
										: "Never"}
								</span>
							),
						},
					]}
				/>
				{canWrite ? (
					<>
						<div className="group-sheet flex items-center justify-between gap-3 px-4 py-3 text-[13px]">
							<label htmlFor="account-active">
								<span className="block font-medium">Active</span>
								<span className="text-[12px] text-muted-foreground">
									Inactive accounts cannot sign requests.
								</span>
							</label>
							<Switch
								id="account-active"
								checked={account.status === "Active"}
								disabled={update.isPending}
								onCheckedChange={(checked) => update.mutate({ status: checked ? "Active" : "Inactive" })}
							/>
						</div>
						<form
							className="group-sheet grid gap-4 p-4"
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
								<Expand open={choice === "custom"}>
									<Input
										type="date"
										aria-label="Expiry date"
										value={date}
										onChange={(e) => setDate(e.target.value)}
									/>
								</Expand>
								<FieldDescription>
									SeaweedFS cannot remove an expiry once set; move it out instead.
								</FieldDescription>
							</Field>
							<Button type="submit" disabled={!dirty || update.isPending} pending={update.isPending}>
								Save changes
							</Button>
						</form>
					</>
				) : (
					<p className="text-[13px] text-muted-foreground">
						<TextMorph>{`Status: ${account.status}`}</TextMorph>
					</p>
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
		</>
	);
}

/** Signing, paused and expired accounts, plus when the rest run out. */
function AccountsDashboard({ accounts, now = Date.now() }: { accounts: ServiceAccount[]; now?: number }) {
	const stats = accountStats(accounts, now);
	const value = (label: string) => stats.find((s) => s.label === label)?.value ?? 0;
	const expired = value("Already expired");
	const signing = value("Can sign");
	const paused = accounts.length - signing - expired;
	const timeline = expiryTimeline(accounts, now);
	const owners = new Map<string, number>();
	for (const a of accounts) owners.set(a.parentUser, (owners.get(a.parentUser) ?? 0) + 1);
	const soon = value("Expire within 30 days");
	return (
		<>
			<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
				<Kpi
					label="Service accounts"
					value={String(accounts.length)}
					hint={`For ${owners.size} ${owners.size === 1 ? "user" : "users"}`}
				/>
				<Kpi
					label="Can sign"
					value={String(signing)}
					hint={paused > 0 ? `${paused} paused` : "None paused"}
				/>
				<Kpi
					label="Expire within 30 days"
					value={String(soon)}
					hint={soon > 0 ? "Renew or replace them" : "Nothing runs out soon"}
					{...(soon > 0 ? { tone: "warn" as const } : {})}
				/>
				<Kpi label="Never expire" value={String(timeline.never)} hint="Long-lived keys; review them" />
				<Kpi
					label="Already expired"
					value={String(expired)}
					hint={expired > 0 ? "They no longer sign; delete them" : "None"}
					{...(expired > 0 ? { tone: "bad" as const } : {})}
				/>
			</div>
			<div className="mt-3 grid items-start gap-3 xl:grid-cols-12">
				<Panel
					title="When they expire"
					description={`Over the next twelve months${timeline.later > 0 ? `, plus ${timeline.later} later` : ""}; ${timeline.never} never expire`}
					className="min-w-0 xl:col-span-8"
				>
					<Columns
						label="Service accounts expiring per month"
						height={180}
						columns={timeline.months}
						color={dataColor(1)}
					/>
				</Panel>
				<div className="grid min-w-0 gap-3 xl:col-span-4">
					<Panel title="Status">
						<Ring
							label="Service accounts by status"
							size={124}
							thickness={14}
							slices={[
								{ label: "Can sign", value: signing, color: dataColor(0), display: String(signing) },
								{ label: "Paused", value: paused, color: dataColor(4), display: String(paused) },
								{ label: "Expired", value: expired, color: dataColor(1), display: String(expired) },
							]}
							center={
								<>
									<span className="font-rounded font-semibold text-[22px] leading-7">
										<RollingValue text={String(accounts.length)} />
									</span>
									<span className="text-[12px] text-muted-foreground">accounts</span>
								</>
							}
						/>
					</Panel>
					<Panel title="Accounts per user">
						<BarList
							label="Service accounts per user"
							color={dataColor(0)}
							items={[...owners.entries()]
								.sort((a, b) => b[1] - a[1])
								.slice(0, 5)
								.map(([user, count]) => ({
									key: user,
									label: user,
									value: count,
									display: String(count),
								}))}
						/>
					</Panel>
				</div>
			</div>
		</>
	);
}

function AccountsSkeleton() {
	return (
		<LoadingRegion label="Loading service accounts">
			<div className="mb-8">
				<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
					{[0, 1, 2, 3, 4].map((i) => (
						<TileGhost key={i} />
					))}
				</div>
				<div className="mt-3 grid items-start gap-3 xl:grid-cols-12">
					<Panel
						title="When they expire"
						description={<TextGhost className="w-56" />}
						className="min-w-0 xl:col-span-8"
					>
						<ColumnsGhost height={180} />
					</Panel>
					<div className="grid min-w-0 gap-3 xl:col-span-4">
						<Panel title="Status">
							<SmallRingGhost rows={3} className="size-[124px]" />
						</Panel>
						<Panel title="Accounts per user">
							<BarsGhost rows={2} />
						</Panel>
					</div>
				</div>
			</div>
			<TableGhost
				columns={["Service account", "Acts as", "Access key", "Status", "Expires"]}
				rows={3}
				twoLine
			/>
		</LoadingRegion>
	);
}

function ServiceAccountsPage() {
	const { account: selectedId } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const canWrite = useCanWrite();
	const accounts = useQuery(accessQueries.serviceAccounts());
	const selected = accounts.data?.find((a) => a.id === selectedId);
	const select = (id: string | undefined) => navigate({ search: id ? { account: id } : {} });
	// The sheet keeps showing its account while it slides away.
	const [shown, setShown] = useState(selected);
	if (selected && selected !== shown) setShown(selected);

	return (
		<>
			<PageHeader
				title="Service accounts"
				description="Keys for automation that act on a user's behalf and can be revoked on their own."
				actions={canWrite && <CreateServiceAccountDialog />}
			/>
			<Loaded query={accounts} skeleton={<AccountsSkeleton />}>
				{(list) => (
					<Swap id={list.length > 0 ? "accounts" : "empty"}>
						{list.length > 0 && (
							<div className="mb-8">
								<AccountsDashboard accounts={list} />
							</div>
						)}
						<DataTable
							data={list}
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
					</Swap>
				)}
			</Loaded>
			<Sheet open={Boolean(selected)} onOpenChange={(open) => !open && select(undefined)}>
				{shown && <AccountSheet account={shown} onClose={() => select(undefined)} />}
			</Sheet>
		</>
	);
}
