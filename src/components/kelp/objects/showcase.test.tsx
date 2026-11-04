import { describe, expect, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import { formatBytes } from "@/lib/format.ts";
import { ShareBars, topShares } from "./showcase.tsx";

describe("topShares", () => {
	test("keeps the largest items and folds the rest into Other", () => {
		const items = [
			{ label: "a", value: 1 },
			{ label: "b", value: 5 },
			{ label: "c", value: 3 },
			{ label: "d", value: 2 },
		];
		expect(topShares(items, 3)).toEqual([
			{ label: "b", value: 5 },
			{ label: "c", value: 3 },
			{ label: "Other", value: 3 },
		]);
		expect(topShares(items, 4).map((s) => s.label)).toEqual(["b", "c", "d", "a"]);
	});
});

describe("ShareBars", () => {
	test("labels every bar with its value, including empty ones", () => {
		render(
			<ShareBars
				label="Data per bucket"
				items={[
					{ label: "media", value: 2048 },
					{ label: "Other", value: 0 },
				]}
				format={formatBytes}
			/>,
		);
		const list = screen.getByRole("list", { name: "Data per bucket" });
		expect(within(list).getByText("media")).toBeTruthy();
		expect(within(list).getByText(formatBytes(2048))).toBeTruthy();
		expect(within(list).getByText(formatBytes(0))).toBeTruthy();
	});
});
