import { beforeEach, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { RouteError } from "./route-error.tsx";

beforeEach(() => sessionStorage.clear());

test("a page from an older build reloads into the new one", () => {
	render(
		<RouteError error={new TypeError("Failed to fetch dynamically imported module: /assets/tables-1.js")} />,
	);
	expect(screen.getByRole("heading", { name: "Kelp was updated" })).toBeTruthy();
	expect(sessionStorage.getItem("kelp-reloaded-for-build")).not.toBeNull();
});

test("any other failure says what happened and offers a reload", () => {
	const reload = mock();
	const { rerender } = render(
		<RouteError error={new Error("Cannot read properties of undefined")} reload={reload} />,
	);
	expect(screen.getByRole("heading", { name: "This page could not be shown" })).toBeTruthy();
	expect(screen.getByText("Cannot read properties of undefined")).toBeTruthy();
	expect(reload).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Reload" }));
	expect(reload).toHaveBeenCalledTimes(1);
	rerender(<RouteError error="odd" reload={reload} />);
	expect(screen.getByText(/Something unexpected went wrong/)).toBeTruthy();
	expect(sessionStorage.getItem("kelp-reloaded-for-build")).toBeNull();
});
