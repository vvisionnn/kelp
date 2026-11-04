import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Button } from "@/components/ui/button";
import { settle } from "../../../test/settle.ts";
import { type Column, DataTable, matchesSearch } from "./data-table.tsx";

interface Row {
	id: string;
	name: string;
	size: number;
}

const rows: Row[] = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, name: `bucket-${i}`, size: i }));
const columns: Array<Column<Row>> = [
	{ accessorKey: "name", header: "Name" },
	{ accessorKey: "size", header: "Size" },
];

function table(props: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) {
	return render(
		<DataTable
			data={rows}
			columns={columns}
			getRowId={(r) => r.id}
			empty={<p>Nothing here</p>}
			searchText={(r) => r.name}
			{...props}
		/>,
	);
}

describe("DataTable", () => {
	test("pages long lists and searches every term", () => {
		table({ pageSize: 10 });
		expect(screen.getByText("bucket-0")).toBeTruthy();
		expect(screen.queryByText("bucket-15")).toBeNull();
		fireEvent.change(screen.getByLabelText("Search"), { target: { value: "BUCKET-15" } });
		expect(screen.getByText("bucket-15")).toBeTruthy();
		expect(screen.queryByText("bucket-0")).toBeNull();
		fireEvent.change(screen.getByLabelText("Search"), { target: { value: "nope" } });
		expect(screen.getByText('Nothing matches "nope".')).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
		expect(screen.getByText("bucket-0")).toBeTruthy();
	});

	test("shows the empty state, errors with retry, and a toolbar", () => {
		const { rerender } = table({ data: [], toolbar: <Button>New</Button> });
		expect(screen.getByText("Nothing here")).toBeTruthy();
		expect(screen.getByRole("button", { name: "New" })).toBeTruthy();
		const retry = mock(() => {});
		rerender(
			<DataTable
				data={undefined}
				columns={columns}
				getRowId={(r) => r.id}
				empty={null}
				error={new Error("boom")}
				onRetry={retry}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(retry).toHaveBeenCalled();
		rerender(<DataTable data={undefined} columns={columns} getRowId={(r) => r.id} empty={null} isLoading />);
		expect(screen.queryByText("Nothing here")).toBeNull();
	});

	test("row clicks and bulk selection", async () => {
		const onRowClick = mock(() => {});
		const bulk = mock((selected: Row[], clear: () => void) => (
			<Button onClick={clear}>Delete {selected.length}</Button>
		));
		table({ data: rows.slice(0, 3), onRowClick, bulkActions: bulk });
		fireEvent.click(screen.getByText("bucket-1"));
		expect(onRowClick).toHaveBeenCalledWith(rows[1]);

		const boxes = screen.getAllByRole("checkbox", { name: "Select row" });
		fireEvent.click(boxes[0] as HTMLElement);
		expect(screen.getByText("1 selected")).toBeTruthy();
		expect(onRowClick).toHaveBeenCalledTimes(1);
		fireEvent.click(screen.getByRole("checkbox", { name: "Select all rows" }));
		expect(screen.getByText("3 selected")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Delete 3" }));
		await settle();
		expect(screen.queryByText("3 selected")).toBeNull();
		fireEvent.click(screen.getByRole("checkbox", { name: "Select all rows" }));
		fireEvent.click(screen.getByRole("button", { name: "Clear" }));
		await settle();
		expect(screen.queryByText(/selected/)).toBeNull();
	});

	test("hides search when rows are not searchable", () => {
		render(<DataTable data={rows.slice(0, 2)} columns={columns} getRowId={(r) => r.id} empty={null} />);
		expect(screen.queryByLabelText("Search")).toBeNull();
		expect(within(screen.getByRole("table")).getByText("bucket-1")).toBeTruthy();
	});

	test("plain text headers sort their column", async () => {
		render(<DataTable data={rows.slice(0, 3)} columns={columns} getRowId={(r) => r.id} empty={null} />);
		const cells = () =>
			screen
				.getAllByRole("cell")
				.map((c) => c.textContent)
				.filter((t) => t?.startsWith("bucket-"));
		expect(cells()).toEqual(["bucket-0", "bucket-1", "bucket-2"]);
		const size = () => screen.getByRole("button", { name: /Size/ });
		fireEvent.click(size());
		expect(cells()).toEqual(["bucket-0", "bucket-1", "bucket-2"]);
		fireEvent.click(size());
		expect(cells()).toEqual(["bucket-2", "bucket-1", "bucket-0"]);
	});

	test("matchesSearch needs every term", () => {
		expect(matchesSearch("media us-east", "MEDIA east")).toBe(true);
		expect(matchesSearch("media", "media west")).toBe(false);
		expect(matchesSearch("anything", "  ")).toBe(true);
	});
});
