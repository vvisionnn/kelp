import type { Bucket } from "@shared/objects.ts";
import { useEffect, useId, useState } from "react";
import { Panel } from "@/components/kelp/page.tsx";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatBytes } from "@/lib/format.ts";
import { useAction } from "@/lib/mutations.ts";
import { objectApi, objectKeys } from "@/lib/objects-queries.ts";
import { useCanWrite } from "@/lib/session.ts";
import { QuotaInput, type QuotaValue, quotaBytes, quotaFromBytes, quotaIsValid } from "./bucket-fields.tsx";
import { OwnerSelect } from "./create-bucket.tsx";

function sameQuota(a: QuotaValue, bucket: Bucket): boolean {
	if (a.enabled !== bucket.quota.enabled) return false;
	return !a.enabled || quotaBytes(a) === bucket.quota.bytes;
}

function QuotaPanel({ bucket }: { bucket: Bucket }) {
	const canWrite = useCanWrite();
	const [quota, setQuota] = useState(() => quotaFromBytes(bucket.quota.bytes, bucket.quota.enabled));
	useEffect(() => setQuota(quotaFromBytes(bucket.quota.bytes, bucket.quota.enabled)), [bucket.quota]);
	const save = useAction({
		run: (value: QuotaValue) =>
			objectApi.setQuota(bucket.name, {
				enabled: value.enabled,
				bytes: value.enabled ? quotaBytes(value) : 0,
			}),
		success: (_out, value) =>
			value.enabled ? `Quota set to ${formatBytes(quotaBytes(value))}` : "Quota removed",
		invalidate: [objectKeys.buckets],
	});
	const dirty = !sameQuota(quota, bucket);
	return (
		<Panel title="Quota" description={`${formatBytes(bucket.logicalSize)} stored now.`}>
			<div className="grid gap-4">
				<QuotaInput value={quota} onChange={setQuota} disabled={!canWrite} />
				{canWrite && (
					<Button
						className="justify-self-start"
						disabled={!dirty || !quotaIsValid(quota) || save.isPending}
						onClick={() => save.mutate(quota)}
					>
						{save.isPending && <Spinner />}
						Save quota
					</Button>
				)}
			</div>
		</Panel>
	);
}

function OwnerPanel({ bucket }: { bucket: Bucket }) {
	const canWrite = useCanWrite();
	const id = useId();
	const [owner, setOwner] = useState(bucket.owner);
	useEffect(() => setOwner(bucket.owner), [bucket.owner]);
	const save = useAction({
		run: (next: string) => objectApi.setOwner(bucket.name, next),
		success: (_out, next) => (next ? `Owner changed to ${next}` : "Owner removed"),
		invalidate: [objectKeys.buckets],
	});
	return (
		<Panel title="Owner" description="Only this S3 identity and administrators can use the bucket.">
			<div className="grid gap-4">
				<label htmlFor={`${id}-owner`} className="sr-only">
					Owner
				</label>
				<OwnerSelect id={`${id}-owner`} value={owner} onChange={setOwner} disabled={!canWrite} />
				{canWrite && (
					<Button
						className="justify-self-start"
						disabled={owner === bucket.owner || save.isPending}
						onClick={() => save.mutate(owner)}
					>
						{save.isPending && <Spinner />}
						Save owner
					</Button>
				)}
			</div>
		</Panel>
	);
}

function Fact({ label, value, note }: { label: string; value: string; note: string }) {
	return (
		<div className="grid gap-0.5">
			<dt className="text-[13px] text-muted-foreground">{label}</dt>
			<dd className="mt-1 font-[450] text-2xl tracking-[-0.02em]">{value}</dd>
			<dd className="text-[13px] text-muted-foreground">{note}</dd>
		</div>
	);
}

/** Versioning and object lock are fixed when the bucket is created; S3 clients change versioning. */
function ProtectionPanel({ bucket }: { bucket: Bucket }) {
	const lock = bucket.objectLock;
	return (
		<Panel title="Protection" description="Set when the bucket was created.">
			<dl className="grid gap-4 sm:grid-cols-2">
				<Fact
					label="Versioning"
					value={bucket.versioning === "Off" ? "Off" : bucket.versioning === "Enabled" ? "On" : "Paused"}
					note="S3 clients can turn versioning on or pause it with PutBucketVersioning."
				/>
				<Fact
					label="Object lock"
					value={lock.enabled ? (lock.mode === "COMPLIANCE" ? "Compliance" : "Governance") : "Off"}
					note={
						lock.enabled
							? lock.retentionDays
								? `New objects are kept for ${lock.retentionDays} days.`
								: "No default retention; set it per object."
							: "Object lock can only be turned on when a bucket is created."
					}
				/>
			</dl>
		</Panel>
	);
}

export function BucketSettings({ bucket }: { bucket: Bucket }) {
	return (
		<div className="grid gap-4 lg:grid-cols-2">
			<QuotaPanel bucket={bucket} />
			<OwnerPanel bucket={bucket} />
			<div className="lg:col-span-2">
				<ProtectionPanel bucket={bucket} />
			</div>
		</div>
	);
}
