import {
	Archive,
	Blocks,
	Bot,
	FolderTree,
	HardDrive,
	Layers,
	LayoutDashboard,
	type LucideIcon,
	MessagesSquare,
	Network,
	ScrollText,
	Settings2,
	Table2,
	Users,
	UsersRound,
	Wrench,
} from "lucide-react";

export interface NavItem {
	title: string;
	to: string;
	icon: LucideIcon;
	/** Extra words the command menu matches on. */
	keywords?: string;
}

export interface NavSection {
	title: string;
	items: NavItem[];
}

export const NAV: NavSection[] = [
	{
		title: "Overview",
		items: [
			{
				title: "Overview",
				to: "/",
				icon: LayoutDashboard,
				keywords: "dashboard home health",
			},
		],
	},
	{
		title: "Cluster",
		items: [
			{
				title: "Nodes",
				to: "/cluster",
				icon: Network,
				keywords: "masters volume servers filers s3 gateways mounts topology",
			},
		],
	},
	{
		title: "Storage",
		items: [
			{
				title: "Volumes",
				to: "/volumes",
				icon: HardDrive,
				keywords: "vacuum read-only grow",
			},
			{ title: "Collections", to: "/collections", icon: Layers },
			{
				title: "Erasure coding",
				to: "/erasure-coding",
				icon: Blocks,
				keywords: "ec shards",
			},
		],
	},
	{
		title: "Object store",
		items: [
			{
				title: "Buckets",
				to: "/buckets",
				icon: Archive,
				keywords: "s3 quota lifecycle policy versioning",
			},
			{ title: "Files", to: "/files", icon: FolderTree, keywords: "filer browse upload" },
			{
				title: "Tables",
				to: "/tables",
				icon: Table2,
				keywords: "iceberg s3 tables namespaces",
			},
		],
	},
	{
		title: "Access",
		items: [
			{ title: "Users", to: "/access/users", icon: Users, keywords: "iam access keys" },
			{ title: "Groups", to: "/access/groups", icon: UsersRound },
			{ title: "Service accounts", to: "/access/service-accounts", icon: Bot },
			{ title: "Policies", to: "/access/policies", icon: ScrollText, keywords: "iam json" },
		],
	},
	{
		title: "Operations",
		items: [
			{
				title: "Maintenance",
				to: "/maintenance",
				icon: Wrench,
				keywords: "workers jobs vacuum balance erasure lifecycle",
			},
			{
				title: "Messaging",
				to: "/messaging",
				icon: MessagesSquare,
				keywords: "mq topics brokers",
			},
			{
				title: "Settings",
				to: "/settings",
				icon: Settings2,
				keywords: "theme about configuration",
			},
		],
	},
];

export const NAV_ITEMS = NAV.flatMap((section) =>
	section.items.map((item) => ({ ...item, section: section.title })),
);

/** The nav item a pathname belongs to: the longest matching `to`, so detail pages find their list. */
export function itemFor(pathname: string): (NavItem & { section: string }) | undefined {
	let best: (NavItem & { section: string }) | undefined;
	for (const item of NAV_ITEMS) {
		const matches =
			item.to === "/" ? pathname === "/" : pathname === item.to || pathname.startsWith(`${item.to}/`);
		if (matches && (!best || item.to.length > best.to.length)) best = item;
	}
	return best;
}
