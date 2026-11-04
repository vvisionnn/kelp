import type { HeaderContext } from "@tanstack/react-table";
import type { DataGridFeatures } from "@/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";

/** A column header renderer that sorts on click, cycling ascending, descending and off. */
export function sortable(title: string) {
	return <T extends object>({ column }: HeaderContext<DataGridFeatures, T, unknown>) => (
		<DataGridColumnHeader column={column} title={title} />
	);
}
