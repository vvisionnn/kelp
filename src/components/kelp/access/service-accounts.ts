import type { ServiceAccount } from "@shared/iam.ts";
import { formatRelative } from "@/lib/format.ts";

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
