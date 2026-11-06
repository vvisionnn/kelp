import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { entry } from "../../../../test/objects-fixtures.ts";
import { FolderSummary } from "./folder-summary.tsx";

describe("folder summary", () => {
	test("an empty folder keeps the summary's shape and says it is empty", () => {
		render(<FolderSummary entries={[]} partial={false} onOpen={() => {}} />);
		expect(screen.getAllByText("This folder is empty.")).toHaveLength(2);
		expect(screen.getByText("Counts every item in this folder.")).toBeTruthy();
	});

	test("every folder gets counts, types and its largest files", () => {
		const onOpen = mock();
		const files = Array.from({ length: 12 }, (_, i) => entry(`/f/file-${i}.png`, { size: (i + 1) * 1024 }));
		const { rerender } = render(
			<FolderSummary entries={files.slice(0, 3)} partial={false} onOpen={onOpen} />,
		);
		const summary = screen.getByRole("region", { name: "Folder summary" });
		expect(within(summary).getByText("Size of files here")).toBeTruthy();
		expect(screen.getByRole("list", { name: "Bytes by file type" })).toBeTruthy();
		expect(screen.getByRole("list", { name: "Largest files" })).toBeTruthy();

		rerender(
			<FolderSummary entries={[entry("/f/sub", { isDirectory: true }), ...files]} partial onOpen={onOpen} />,
		);
		expect(screen.getByText(/Counts the first 13 items/)).toBeTruthy();
		const largest = screen.getByRole("list", { name: "Largest files" });
		fireEvent.click(within(largest).getByText("file-11.png"));
		expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ name: "file-11.png" }));
	});

	test("a folder of folders says so where the file charts would be", () => {
		render(
			<FolderSummary entries={[entry("/f/a", { isDirectory: true })]} partial={false} onOpen={() => {}} />,
		);
		expect(screen.queryByRole("list", { name: "Bytes by file type" })).toBeNull();
		expect(screen.getAllByText("Only folders here.")).toHaveLength(2);
	});
});
