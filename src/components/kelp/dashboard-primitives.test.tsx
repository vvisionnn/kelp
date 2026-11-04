import { describe, expect, mock, test } from "bun:test";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { HardDrive } from "lucide-react";
import { useState } from "react";
import { HoldToDelete, Segmented } from "./controls.tsx";
import { itemFor } from "./nav.ts";
import { InfoList, PageHeader, PageItemContext, Section, StatBand } from "./page.tsx";
import { Tile } from "./tile.tsx";

function SegmentHarness({ onChange }: { onChange: (value: string) => void }) {
	const [value, setValue] = useState<"all" | "busy">("all");
	return (
		<Segmented
			label="Filter volumes"
			items={[
				{ value: "all", label: "All" },
				{ value: "busy", label: "Busy" },
			]}
			value={value}
			onChange={(next) => {
				onChange(next);
				setValue(next);
			}}
		/>
	);
}

describe("dashboard primitives", () => {
	test("a page header wears its page's identity tile when the shell provides one", () => {
		const { container, rerender } = render(<PageHeader title="Volumes" description="All of them" />);
		expect(container.querySelector(".tile")).toBeNull();
		rerender(
			<PageItemContext.Provider value={{ icon: HardDrive, tile: "#0a84ff" }}>
				<PageHeader title="Volumes" description="All of them" actions={<button type="button">Grow</button>} />
			</PageItemContext.Provider>,
		);
		const tile = container.querySelector<HTMLElement>(".tile");
		expect(tile?.style.getPropertyValue("--tile")).toBe("#0a84ff");
		expect(screen.getByRole("heading", { level: 1, name: "Volumes" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Grow" })).toBeTruthy();
	});

	test("tiles come in three sizes", () => {
		const { container } = render(
			<>
				<Tile item={{ icon: HardDrive, tile: "#000" }} />
				<Tile item={{ icon: HardDrive, tile: "#000" }} size="md" />
				<Tile item={{ icon: HardDrive, tile: "#000" }} size="lg" className="extra" />
			</>,
		);
		const tiles = [...container.querySelectorAll(".tile")].map((t) => t.className);
		expect(tiles[0]).toContain("size-5");
		expect(tiles[1]).toContain("size-7");
		expect(tiles[2]).toContain("size-9");
		expect(tiles[2]).toContain("extra");
	});

	test("sections title their content and info lists pair labels with values", () => {
		render(
			<Section title="Copies" description="Where the volume lives" actions={<span>Act</span>}>
				<InfoList
					items={[
						{ label: "Server", value: "127.0.0.1:8080" },
						{ label: "Size", value: "12 MiB" },
					]}
				/>
			</Section>,
		);
		expect(screen.getByRole("heading", { level: 2, name: "Copies" })).toBeTruthy();
		expect(screen.getByText("Where the volume lives")).toBeTruthy();
		expect(screen.getByText("Act")).toBeTruthy();
		const server = screen.getByText("Server").parentElement;
		expect(within(server as HTMLElement).getByText("127.0.0.1:8080")).toBeTruthy();
	});

	test("a stat band shows each number as a widget with its label and hint", () => {
		render(
			<StatBand
				stats={[
					{ label: "Volumes", value: 57, hint: "167 free slots" },
					{ label: "Stored", value: 2048, format: (n) => `${n} B` },
				]}
			/>,
		);
		expect(screen.getByText("167 free slots")).toBeTruthy();
		expect(screen.getByText("B").parentElement?.textContent).toBe("2048B");
	});

	test("the segmented control reports the chosen segment", async () => {
		const onChange = mock();
		render(<SegmentHarness onChange={onChange} />);
		const group = screen.getByRole("radiogroup", { name: "Filter volumes" });
		await act(async () => {
			fireEvent.keyDown(within(group).getByRole("radio", { name: "All" }), { key: "ArrowRight" });
		});
		expect(onChange).toHaveBeenCalledWith("busy");
		expect(within(group).getByRole("radio", { name: "Busy" }).getAttribute("aria-checked")).toBe("true");
	});

	test("hold to delete renders as a button and can be disabled", () => {
		render(
			<>
				<HoldToDelete onConfirm={() => {}}>Delete bucket</HoldToDelete>
				<HoldToDelete onConfirm={() => {}} disabled>
					Delete user
				</HoldToDelete>
			</>,
		);
		expect(screen.getByRole("button", { name: /Delete bucket/ })).toBeTruthy();
		expect((screen.getByRole("button", { name: /Delete user/ }) as HTMLButtonElement).disabled).toBe(true);
	});

	test("itemFor finds the list a detail page belongs to", () => {
		expect(itemFor("/")?.title).toBe("Overview");
		expect(itemFor("/volumes/12")?.title).toBe("Volumes");
		expect(itemFor("/access/users/lena")?.title).toBe("Users");
		expect(itemFor("/nowhere")).toBeUndefined();
	});
});
