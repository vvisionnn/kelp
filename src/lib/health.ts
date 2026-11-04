import type { Overview } from "@shared/api.ts";
import { formatPercent, ratio } from "./format.ts";

/** One sentence describing cluster health, for the page header. */
export function healthSummary(overview: Overview): { tone: "good" | "warn" | "bad"; text: string } {
	const leader = overview.masters.some((m) => m.isLeader);
	if (!leader) return { tone: "bad", text: "No master leader. The cluster cannot assign new writes." };
	if (overview.volumeServers.length === 0) return { tone: "bad", text: "No volume servers are reporting." };
	const used = ratio(
		overview.volumeServers.reduce((sum, s) => sum + s.diskUsage, 0),
		overview.volumeServers.reduce((sum, s) => sum + s.diskCapacity, 0),
	);
	if (used >= 0.9) return { tone: "warn", text: `Disks are ${formatPercent(used)} full. Add capacity soon.` };
	if (!overview.versions.uniform) return { tone: "warn", text: "Nodes run different SeaweedFS versions." };
	const servers = overview.volumeServers.length;
	return {
		tone: "good",
		text: `Healthy. ${servers} volume ${servers === 1 ? "server" : "servers"} reporting.`,
	};
}
