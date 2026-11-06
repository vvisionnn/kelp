import { Link } from "@tanstack/react-router";
import { ChevronRight, ScrollText, UsersRound } from "lucide-react";
import { motion } from "motion/react";
import type { CSSProperties } from "react";
import { Legend } from "@/components/kelp/charts/index.ts";
import { cn } from "@/lib/utils";
import { EASE, SPEED, usePrefersReducedMotion } from "../motion.ts";
import { Swap } from "../transitions.tsx";
import {
	type AccessLevel,
	type AccessMatrix,
	ALL_BUCKETS,
	type Attention,
	type BucketGrant,
	type Capability,
	LEVEL_LABEL,
	LEVELS,
	type MatrixCell,
} from "./analysis.ts";
import { Avatar } from "./identity.tsx";

/**
 * One hue, light to dark, for an ordinal scale (dataviz: sequential = one hue). Indigo is the
 * first data color; reach grows with the fill.
 */
const LEVEL_FILL: Record<AccessLevel, number> = { list: 0.22, read: 0.45, write: 0.72, admin: 1 };

function cellStyle(cell: MatrixCell): CSSProperties | undefined {
	if (!cell.level) return undefined;
	const fill = `color-mix(in oklab, var(--data-1) ${LEVEL_FILL[cell.level] * 100}%, transparent)`;
	// Access that only comes from an all-buckets grant is striped, so it reads as inherited.
	return cell.inherited
		? {
				backgroundImage: `repeating-linear-gradient(135deg, ${fill} 0 3px, transparent 3px 6px)`,
				boxShadow: `inset 0 0 0 1px ${fill}`,
			}
		: { background: fill };
}

function cellLabel(user: string, bucket: string, cell: MatrixCell): string {
	if (!cell.level) return `${user}: no access to ${bucket}`;
	const source = cell.via.length > 0 ? `, via ${cell.via.join(", ")}` : "";
	return `${user}: ${LEVEL_LABEL[cell.level]} on ${bucket}${cell.inherited ? " (all buckets)" : ""}${source}`;
}

/**
 * Who can reach what: users down the side, buckets across the top, each cell filled by the
 * strongest access the user has to that bucket. Every cell names its level and source on hover
 * and to screen readers.
 */
export function AccessMatrixView({
	matrix,
	rows = "user",
	className,
}: {
	matrix: AccessMatrix;
	/** What the rows are; each links to its own page with a matching glyph. */
	rows?: "user" | "group" | "policy";
	className?: string;
}) {
	const columns = ["All buckets", ...matrix.buckets];
	return (
		<div className={className}>
			<div className="-mx-1 overflow-x-auto px-1 pb-1 [&_table]:min-w-[32rem]">
				<table className="w-full table-fixed border-separate border-spacing-1 text-[12px]">
					<caption className="sr-only">Access by {rows} and bucket</caption>
					<thead>
						<tr>
							<th scope="col" className="w-36 text-left font-normal text-muted-foreground">
								<span className="sr-only">{{ user: "User", group: "Group", policy: "Policy" }[rows]}</span>
							</th>
							{columns.map((bucket, i) => (
								<th
									key={bucket}
									scope="col"
									title={bucket}
									className={cn(
										"pb-1 align-bottom font-normal text-muted-foreground",
										i === 0 && "w-22 pr-3",
									)}
								>
									<span className={cn("block truncate text-[11px]", i > 0 && "font-mono")}>{bucket}</span>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{matrix.rows.map((row) => (
							<tr key={row.user}>
								<th scope="row" className="pr-3 text-left font-normal">
									{rows === "user" ? (
										<Link
											to="/access/users/$username"
											params={{ username: row.user }}
											className="flex min-w-0 items-center gap-2 hover:underline"
										>
											<Avatar name={row.user} />
											<span className="truncate">{row.user}</span>
										</Link>
									) : rows === "policy" ? (
										<Link
											to="/access/policies/$name"
											params={{ name: row.user }}
											className="flex min-w-0 items-center gap-2 hover:underline"
										>
											<ScrollText className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
											<span className="truncate font-mono">{row.user}</span>
										</Link>
									) : (
										<Link
											to="/access/groups/$name"
											params={{ name: row.user }}
											className="flex min-w-0 items-center gap-2 hover:underline"
										>
											<UsersRound className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
											<span className="truncate">{row.user}</span>
										</Link>
									)}
								</th>
								{[row.all, ...matrix.buckets.map((b) => row.cells[b] as MatrixCell)].map((cell, i) => {
									const bucket = columns[i] as string;
									const label = cellLabel(row.user, bucket, cell);
									return (
										<td key={bucket} className={cn(i === 0 && "pr-3")}>
											<span
												title={label}
												aria-label={label}
												role="img"
												data-level={cell.level ?? "none"}
												className="block h-6 w-full rounded-[5px] bg-accent/60"
												style={cellStyle(cell)}
											/>
										</td>
									);
								})}
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<Legend
				className="mt-3"
				items={[
					...LEVELS.map((level) => ({
						label: LEVEL_LABEL[level],
						color: `color-mix(in oklab, var(--data-1) ${LEVEL_FILL[level] * 100}%, transparent)`,
					})),
					{
						label: "From an all-buckets grant",
						color: "repeating-linear-gradient(135deg, var(--data-1) 0 2px, transparent 2px 4px)",
					},
				]}
			/>
		</div>
	);
}

const TONE: Record<Attention["tone"], string> = {
	bad: "bg-destructive",
	warn: "bg-warning",
	info: "bg-muted-foreground/50",
};

/** Things to look at, most serious first, each linking to the user concerned. */
export function AttentionList({ items, limit = 6 }: { items: Attention[]; limit?: number }) {
	if (items.length === 0)
		return (
			<p className="py-6 text-center text-[13px] text-muted-foreground">
				Nothing needs attention. Every key is fresh and every user reaches something.
			</p>
		);
	const shown = items.slice(0, limit);
	return (
		<ul className="-mx-4 -my-1 divide-y divide-border">
			{shown.map((item) => (
				<li key={item.key}>
					<Link
						to="/access/users/$username"
						params={{ username: item.user }}
						className="flex items-start gap-3 px-4 py-2.5 hover:bg-raised/70"
					>
						<span className={cn("mt-1.5 size-2 shrink-0 rounded-full", TONE[item.tone])} aria-hidden="true" />
						<span className="min-w-0 flex-1">
							<span className="block truncate text-[13px]">{item.title}</span>
							<span className="block truncate text-[12px] text-muted-foreground">{item.detail}</span>
						</span>
						<ChevronRight className="mt-1 size-4 shrink-0 text-tertiary" />
					</Link>
				</li>
			))}
			{items.length > limit && (
				<li className="px-4 py-2 text-[12px] text-muted-foreground">And {items.length - limit} more.</li>
			)}
		</ul>
	);
}

/**
 * How many users can change, read or only list each bucket: one stacked bar per bucket on the same
 * indigo ramp as the matrix, so "more reach" always reads darker.
 */
export function ExposureBars({ matrix }: { matrix: AccessMatrix }) {
	const reduced = usePrefersReducedMotion();
	const levels: AccessLevel[] = ["admin", "write", "read", "list"];
	const rows = matrix.buckets
		.map((bucket) => {
			const counts = Object.fromEntries(levels.map((level) => [level, 0])) as Record<AccessLevel, number>;
			for (const row of matrix.rows) {
				const level = row.cells[bucket]?.level;
				if (level) counts[level]++;
			}
			return { bucket, counts, total: levels.reduce((sum, level) => sum + counts[level], 0) };
		})
		.sort((a, b) => b.counts.admin + b.counts.write - (a.counts.admin + a.counts.write) || b.total - a.total);
	const max = Math.max(1, ...rows.map((r) => r.total));
	return (
		<div>
			<ul aria-label="Users who can reach each bucket" className="space-y-2.5">
				{rows.map((row) => (
					<li
						key={row.bucket}
						className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-3 text-[13px]"
					>
						<span className="truncate font-mono">{row.bucket}</span>
						<motion.span
							className="flex h-2 gap-0.5"
							initial={reduced ? false : { width: 0 }}
							animate={{ width: `${(row.total / max) * 100}%` }}
							transition={{ duration: SPEED.data, ease: EASE }}
						>
							{levels.map((level) =>
								row.counts[level] > 0 ? (
									<span
										key={level}
										title={`${row.counts[level]} with ${LEVEL_LABEL[level].toLowerCase()}`}
										className="h-full rounded-[2px] first:rounded-l-full last:rounded-r-full"
										style={{
											flexGrow: row.counts[level],
											background: `color-mix(in oklab, var(--data-1) ${LEVEL_FILL[level] * 100}%, transparent)`,
										}}
									/>
								) : null,
							)}
						</motion.span>
						<span className="text-right text-muted-foreground tabular">
							{row.counts.admin + row.counts.write} can change
						</span>
					</li>
				))}
			</ul>
			<Legend
				className="mt-3"
				items={levels.map((level) => ({
					label: LEVEL_LABEL[level],
					color: `color-mix(in oklab, var(--data-1) ${LEVEL_FILL[level] * 100}%, transparent)`,
				}))}
			/>
		</div>
	);
}

const CAPABILITIES: Array<{ key: Capability; label: string }> = [
	{ key: "list", label: "List" },
	{ key: "read", label: "Read" },
	{ key: "write", label: "Write" },
	{ key: "delete", label: "Delete" },
	{ key: "admin", label: "Admin" },
];

/**
 * A permission grid for one identity: a row per bucket, a column per capability, and where each
 * row's access comes from. All-bucket access sorts first.
 */
export function ReachGrid({ grants, empty }: { grants: BucketGrant[]; empty: string }) {
	return (
		<Swap id={grants.length === 0 ? "empty" : "grid"}>
			{grants.length === 0 ? (
				<p className="py-6 text-center text-[13px] text-muted-foreground">{empty}</p>
			) : (
				<ReachTable grants={grants} />
			)}
		</Swap>
	);
}

function ReachTable({ grants }: { grants: BucketGrant[] }) {
	return (
		<div className="-mx-1 overflow-x-auto px-1">
			<table className="w-full min-w-[30rem] text-[13px]">
				<caption className="sr-only">Access by bucket and capability</caption>
				<thead>
					<tr className="text-[12px] text-muted-foreground">
						<th scope="col" className="pb-2 text-left font-normal">
							Bucket
						</th>
						{CAPABILITIES.map((c) => (
							<th key={c.key} scope="col" className="w-14 pb-2 font-normal">
								{c.label}
							</th>
						))}
						<th scope="col" className="pb-2 pl-3 text-left font-normal">
							Granted by
						</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-border">
					{grants.map((grant) => (
						<tr key={grant.bucket}>
							<th scope="row" className="py-2 text-left font-normal">
								{grant.bucket === ALL_BUCKETS ? (
									<span className="font-medium">All buckets</span>
								) : (
									<span className="font-mono">{grant.bucket}</span>
								)}
							</th>
							{CAPABILITIES.map((c) => {
								const on = grant.capabilities.includes(c.key);
								return (
									<td key={c.key} className="py-2 text-center">
										<span
											role="img"
											aria-label={`${c.label}: ${on ? "allowed" : "not allowed"}`}
											className={cn(
												"mx-auto block size-3 rounded-full",
												on ? "bg-[var(--data-1)]" : "bg-accent",
											)}
										/>
									</td>
								);
							})}
							<td className="py-2 pl-3 text-[12px] text-muted-foreground">{grant.via.join(", ")}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
