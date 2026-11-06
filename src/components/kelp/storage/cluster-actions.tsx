import type { GrowVolumesInput, StorageInventory } from "@shared/storage.ts";
import { Eraser, Plus } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Segmented } from "@/components/kelp/controls.tsx";
import { SkeletonBlock } from "@/components/kelp/page.tsx";
import { TextMorph } from "@/components/kelp/text-morph.tsx";
import { Swap } from "@/components/kelp/transitions.tsx";
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatBytes, formatPercent } from "@/lib/format.ts";
import { useAction } from "@/lib/mutations.ts";
import { storageApi, storageKey, VACUUM_THRESHOLD } from "@/lib/storage-queries.ts";
import { Collapse } from "./common.tsx";

/** Plain-language reading of a replication setting like "011". */
export function describeReplication(replication: string): string {
	if (!/^\d{3}$/.test(replication))
		return "Three digits: copies in other data centers, other racks, other servers.";
	const [dc = 0, rack = 0, server = 0] = [...replication].map(Number);
	const extras = [
		dc && `${dc} in ${dc > 1 ? "other data centers" : "another data center"}`,
		rack && `${rack} on ${rack > 1 ? "other racks" : "another rack"}`,
		server && `${server} on ${server > 1 ? "other servers" : "another server"} in the same rack`,
	].filter(Boolean);
	const copies = 1 + dc + rack + server;
	return extras.length === 0
		? "1 copy, no replication."
		: `${copies} copies: the original plus ${extras.join(", ")}.`;
}

function DataList({ id, values }: { id: string; values: string[] }) {
	return (
		<datalist id={id}>
			{[...new Set(values)].filter(Boolean).map((value) => (
				<option key={value} value={value} />
			))}
		</datalist>
	);
}

export function GrowVolumesDialog({
	inventory,
	collection,
}: {
	inventory: StorageInventory | undefined;
	collection?: string;
}) {
	const [open, setOpen] = useState(false);
	const ids = { collections: useId(), disks: useId(), dcs: useId(), racks: useId() };
	const initial = {
		count: "1",
		collection: collection ?? "",
		replication: "000",
		ttl: "",
		diskType: "",
		dataCenter: "",
		rack: "",
	};
	const [form, setForm] = useState(initial);
	const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
		setForm((f) => ({ ...f, [key]: event.target.value }));
	const grow = useAction({
		run: (input: GrowVolumesInput) => storageApi.grow(input),
		success: ({ count }) => `${count} ${count === 1 ? "volume" : "volumes"} added`,
		invalidate: [storageKey],
		onSuccess: () => {
			setOpen(false);
			setForm(initial);
		},
	});
	const count = Number(form.count);
	const countError =
		!Number.isInteger(count) || count < 1 || count > 100 ? "Choose between 1 and 100 volumes." : null;
	const replicationError = /^\d{3}$/.test(form.replication) ? null : "Use three digits, like 001.";
	const ttlError = /^(\d+[mhdwMy])?$/.test(form.ttl) ? null : "Use a number and a unit: m, h, d, w, M or y.";

	function submit(event: FormEvent) {
		event.preventDefault();
		if (countError || replicationError || ttlError) return;
		grow.mutate({
			count,
			collection: form.collection.trim(),
			replication: form.replication,
			ttl: form.ttl,
			diskType: form.diskType.trim(),
			dataCenter: form.dataCenter.trim(),
			rack: form.rack.trim(),
		});
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger render={<Button />}>
				<Plus />
				Grow volumes
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<form onSubmit={submit} noValidate>
					<DialogHeader>
						<DialogTitle>Grow volumes</DialogTitle>
						<DialogDescription>
							Create empty volumes ahead of time so writes never wait for one.
							{inventory && ` Each holds up to ${formatBytes(inventory.volumeSizeLimitBytes)}.`}
						</DialogDescription>
					</DialogHeader>
					<FieldGroup className="my-5 grid gap-4 sm:grid-cols-2">
						<Field data-invalid={Boolean(countError)}>
							<FieldLabel htmlFor="grow-count">Volumes</FieldLabel>
							<Input
								id="grow-count"
								inputMode="numeric"
								value={form.count}
								onChange={set("count")}
								aria-invalid={Boolean(countError)}
							/>
							<Collapse open={Boolean(countError)}>
								<FieldError>{countError}</FieldError>
							</Collapse>
						</Field>
						<Field>
							<FieldLabel htmlFor="grow-collection">Collection</FieldLabel>
							<Input
								id="grow-collection"
								list={ids.collections}
								placeholder="Default"
								value={form.collection}
								onChange={set("collection")}
							/>
							<DataList id={ids.collections} values={inventory?.collections.map((c) => c.name) ?? []} />
						</Field>
						<Field data-invalid={Boolean(replicationError)} className="sm:col-span-2">
							<FieldLabel htmlFor="grow-replication">Replication</FieldLabel>
							<Input
								id="grow-replication"
								className="font-mono"
								value={form.replication}
								onChange={set("replication")}
								aria-invalid={Boolean(replicationError)}
							/>
							<Swap id={replicationError ? "error" : "hint"}>
								{replicationError ? (
									<FieldError>{replicationError}</FieldError>
								) : (
									<FieldDescription>{describeReplication(form.replication)}</FieldDescription>
								)}
							</Swap>
						</Field>
						<Field data-invalid={Boolean(ttlError)}>
							<FieldLabel htmlFor="grow-ttl">Time to live</FieldLabel>
							<Input
								id="grow-ttl"
								placeholder="Keep forever"
								value={form.ttl}
								onChange={set("ttl")}
								aria-invalid={Boolean(ttlError)}
							/>
							<Swap id={ttlError ? "error" : "hint"}>
								{ttlError ? (
									<FieldError>{ttlError}</FieldError>
								) : (
									<FieldDescription>For example 7d or 12h.</FieldDescription>
								)}
							</Swap>
						</Field>
						<Field>
							<FieldLabel htmlFor="grow-disk">Disk type</FieldLabel>
							<Input
								id="grow-disk"
								list={ids.disks}
								placeholder="hdd"
								value={form.diskType}
								onChange={set("diskType")}
							/>
							<DataList id={ids.disks} values={inventory?.disks.map((d) => d.diskType) ?? []} />
						</Field>
						<Field>
							<FieldLabel htmlFor="grow-dc">Data center</FieldLabel>
							<Input
								id="grow-dc"
								list={ids.dcs}
								placeholder="Any"
								value={form.dataCenter}
								onChange={set("dataCenter")}
							/>
							<DataList id={ids.dcs} values={inventory?.disks.map((d) => d.dataCenter) ?? []} />
						</Field>
						<Field>
							<FieldLabel htmlFor="grow-rack">Rack</FieldLabel>
							<Input
								id="grow-rack"
								list={ids.racks}
								placeholder="Any"
								value={form.rack}
								onChange={set("rack")}
							/>
							<DataList id={ids.racks} values={inventory?.disks.map((d) => d.rack) ?? []} />
						</Field>
					</FieldGroup>
					<DialogFooter>
						<Button type="submit" disabled={grow.isPending} pending={grow.isPending}>
							Grow volumes
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

const THRESHOLDS = [0.01, 0.1, VACUUM_THRESHOLD, 0.5];

export function VacuumClusterDialog({ inventory }: { inventory: StorageInventory | undefined }) {
	const [open, setOpen] = useState(false);
	const [threshold, setThreshold] = useState(VACUUM_THRESHOLD);
	const candidates =
		inventory?.volumes.filter((v) => v.deletedBytes > 0 && v.garbageRatio >= threshold) ?? [];
	const reclaim = candidates.reduce((sum, v) => sum + v.deletedBytes, 0);
	const vacuum = useAction({
		run: () => storageApi.vacuumCluster(threshold),
		success: "Cluster vacuumed",
		invalidate: [storageKey],
		onSuccess: () => setOpen(false),
	});
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger render={<Button variant="secondary" />}>
				<Eraser />
				Vacuum cluster
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Vacuum cluster</DialogTitle>
					<DialogDescription>
						Compacts volumes to reclaim space from deleted files. Volumes stay readable; writes to a volume
						pause briefly while it compacts.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-2 py-2">
					<p className="font-medium text-[13px]">Compact volumes with at least this much garbage</p>
					<Segmented
						label="Garbage threshold"
						items={THRESHOLDS.map((t) => ({ value: String(t), label: formatPercent(t) }))}
						value={String(threshold)}
						onChange={(value) => setThreshold(Number(value))}
						className="w-full"
					/>
					<div className="min-h-[18px] text-[13px] text-muted-foreground" aria-live="polite">
						{!inventory ? (
							<SkeletonBlock className="h-3.5 w-64 max-w-full" />
						) : candidates.length === 0 ? (
							<TextMorph>No volume is over this threshold right now.</TextMorph>
						) : (
							<TextMorph>{`${candidates.length} ${candidates.length === 1 ? "volume" : "volumes"} qualify, about ${formatBytes(reclaim)} to reclaim.`}</TextMorph>
						)}
					</div>
				</div>
				<DialogFooter>
					<Button onClick={() => vacuum.mutate()} disabled={vacuum.isPending} pending={vacuum.isPending}>
						Vacuum cluster
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
