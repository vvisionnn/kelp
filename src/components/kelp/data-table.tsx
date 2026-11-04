import type { ColumnDef, PaginationState, RowSelectionState, SortingState } from "@tanstack/react-table";
import { useTable } from "@tanstack/react-table";
import { Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
	DataGrid,
	DataGridContainer,
	type DataGridFeatures,
	dataGridFeatures,
} from "@/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { ErrorState } from "./page.tsx";

export type Column<T extends object> = ColumnDef<DataGridFeatures, T>;

export interface DataTableProps<T extends object> {
	data: T[] | undefined;
	columns: Array<Column<T>>;
	getRowId: (row: T) => string;
	isLoading?: boolean;
	error?: unknown;
	onRetry?: () => void;
	/** Text used by the search box; omit to hide search. */
	searchText?: (row: T) => string;
	searchPlaceholder?: string;
	toolbar?: ReactNode;
	empty: ReactNode;
	onRowClick?: (row: T) => void;
	pageSize?: number;
	initialSorting?: SortingState;
	/** Enables row checkboxes; receives the selected rows and a way to clear them. */
	bulkActions?: (selected: T[], clear: () => void) => ReactNode;
}

/** Case-insensitive match on every whitespace-separated term. */
export function matchesSearch(text: string, query: string): boolean {
	const haystack = text.toLowerCase();
	return query
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean)
		.every((term) => haystack.includes(term));
}

function headerWithSort<T extends object>(title: string): Column<T>["header"] {
	return ({ column }) => <DataGridColumnHeader column={column} title={title} />;
}

export function DataTable<T extends object>({
	data,
	columns,
	getRowId,
	isLoading,
	error,
	onRetry,
	searchText,
	searchPlaceholder = "Search",
	toolbar,
	empty,
	onRowClick,
	pageSize = 25,
	initialSorting = [],
	bulkActions,
}: DataTableProps<T>) {
	const [query, setQuery] = useState("");
	const [sorting, setSorting] = useState<SortingState>(initialSorting);
	const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize });
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

	const rows = useMemo(() => {
		if (!data) return [];
		if (!query.trim() || !searchText) return data;
		return data.filter((row) => matchesSearch(searchText(row), query));
	}, [data, query, searchText]);

	// A new search always starts from the first page.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the query changes.
	useEffect(() => setPagination((p) => ({ ...p, pageIndex: 0 })), [query]);

	const allColumns = useMemo<Array<Column<T>>>(() => {
		// Text headers become sort menus; custom header renderers are left alone.
		const sortableColumns = columns.map((column) =>
			typeof column.header === "string" && column.enableSorting !== false
				? Object.assign({}, column, { header: headerWithSort<T>(column.header) })
				: column,
		);
		if (!bulkActions) return sortableColumns;
		const select: Column<T> = {
			id: "select",
			header: ({ table }) => (
				<Checkbox
					aria-label="Select all rows"
					checked={table.getIsAllPageRowsSelected()}
					indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
					onCheckedChange={(value) => table.toggleAllPageRowsSelected(Boolean(value))}
				/>
			),
			cell: ({ row }) => (
				<Checkbox
					aria-label="Select row"
					checked={row.getIsSelected()}
					onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
					onClick={(event) => event.stopPropagation()}
				/>
			),
			size: 40,
			enableSorting: false,
			enableHiding: false,
		};
		return [select, ...sortableColumns];
	}, [columns, bulkActions]);

	const table = useTable({
		features: dataGridFeatures,
		columns: allColumns,
		data: rows,
		getRowId,
		state: { sorting, pagination, rowSelection },
		onSortingChange: setSorting,
		onPaginationChange: setPagination,
		onRowSelectionChange: setRowSelection,
		enableRowSelection: Boolean(bulkActions),
	});

	const selected = rows.filter((row) => rowSelection[getRowId(row)]);
	const clear = () => setRowSelection({});

	if (error) return <ErrorState error={error} {...(onRetry ? { onRetry } : {})} />;

	const showEmpty = !isLoading && data !== undefined && data.length === 0;

	return (
		<div className="space-y-3">
			{(searchText || toolbar) && (
				<div className="flex flex-wrap items-center gap-2">
					{searchText && (
						<InputGroup className="w-full sm:w-64">
							<InputGroupAddon>
								<Search />
							</InputGroupAddon>
							<InputGroupInput
								aria-label={searchPlaceholder}
								placeholder={searchPlaceholder}
								value={query}
								onChange={(event) => setQuery(event.target.value)}
							/>
							{query && (
								<InputGroupAddon align="inline-end">
									<InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => setQuery("")}>
										<X />
									</InputGroupButton>
								</InputGroupAddon>
							)}
						</InputGroup>
					)}
					{toolbar && <div className="flex flex-1 flex-wrap items-center justify-end gap-2">{toolbar}</div>}
				</div>
			)}

			<AnimatePresence>
				{bulkActions && selected.length > 0 && (
					<motion.div
						initial={{ opacity: 0, y: -4 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -4 }}
						className="flex flex-wrap items-center gap-2 rounded-lg bg-primary/10 py-1.5 pr-1.5 pl-3 text-[13px]"
					>
						<span className="font-medium tabular">{selected.length} selected</span>
						<div className="ml-auto flex flex-wrap gap-2">{bulkActions(selected, clear)}</div>
						<Button variant="ghost" size="sm" onClick={clear}>
							Clear
						</Button>
					</motion.div>
				)}
			</AnimatePresence>

			{showEmpty ? (
				empty
			) : (
				<DataGrid
					table={table}
					recordCount={rows.length}
					isLoading={Boolean(isLoading)}
					loadingMode="skeleton"
					emptyMessage={query ? `Nothing matches "${query}".` : "No results."}
					{...(onRowClick ? { onRowClick } : {})}
					tableLayout={{ headerBackground: false, rowBorder: true, dense: false }}
				>
					<div className="w-full space-y-2.5">
						<DataGridContainer className="group-sheet px-1">
							<DataGridScrollArea>
								<DataGridTable />
							</DataGridScrollArea>
						</DataGridContainer>
						{rows.length > pagination.pageSize && <DataGridPagination />}
					</div>
				</DataGrid>
			)}
		</div>
	);
}
