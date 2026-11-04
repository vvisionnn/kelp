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
	/** Identity tile color (DESIGN.md, "Identity tiles"). */
	tile: string;
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
				tile: "#3a3a3c",
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
				tile: "#5e5ce6",
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
				tile: "#0a84ff",
				icon: HardDrive,
				keywords: "vacuum read-only grow",
			},
			{ title: "Collections", to: "/collections", tile: "#30b0c7", icon: Layers },
			{
				title: "Erasure coding",
				to: "/erasure-coding",
				tile: "#bf5af2",
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
				tile: "#ff9f0a",
				icon: Archive,
				keywords: "s3 quota lifecycle policy versioning",
			},
			{ title: "Files", to: "/files", tile: "#5ac8fa", icon: FolderTree, keywords: "filer browse upload" },
			{
				title: "Tables",
				to: "/tables",
				tile: "#ffb800",
				icon: Table2,
				keywords: "iceberg s3 tables namespaces",
			},
		],
	},
	{
		title: "Access",
		items: [
			{ title: "Users", to: "/access/users", tile: "#ff375f", icon: Users, keywords: "iam access keys" },
			{ title: "Groups", to: "/access/groups", tile: "#a2845e", icon: UsersRound },
			{ title: "Service accounts", to: "/access/service-accounts", tile: "#7d7aff", icon: Bot },
			{ title: "Policies", to: "/access/policies", tile: "#8e8e93", icon: ScrollText, keywords: "iam json" },
		],
	},
	{
		title: "Operations",
		items: [
			{
				title: "Maintenance",
				to: "/maintenance",
				tile: "#636366",
				icon: Wrench,
				keywords: "workers jobs vacuum balance erasure lifecycle",
			},
			{
				title: "Messaging",
				to: "/messaging",
				tile: "#30d158",
				icon: MessagesSquare,
				keywords: "mq topics brokers",
			},
			{
				title: "Settings",
				to: "/settings",
				tile: "#8e8e93",
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
