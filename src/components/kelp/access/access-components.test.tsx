import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describeActions } from "@/lib/access-queries.ts";
import { setMedia } from "../../../../test/media.ts";
import { settle } from "../../../../test/settle.ts";
import { NameList } from "./badges.tsx";
import { NewSecretPanel } from "./new-secret.tsx";
import { TokenField } from "./token-field.tsx";

function Tokens({ initial = [] as string[] }) {
	const [value, setValue] = useState(initial);
	return <TokenField label="Actions" value={value} onChange={setValue} suggestions={["Read", "Write"]} />;
}

describe("TokenField", () => {
	test("adds with Enter, comma, blur and suggestions; removes with Backspace and buttons", async () => {
		render(<Tokens />);
		const input = screen.getByLabelText("Actions");
		fireEvent.change(input, { target: { value: "List" } });
		fireEvent.keyDown(input, { key: "Enter" });
		fireEvent.change(input, { target: { value: "Tagging" } });
		fireEvent.keyDown(input, { key: "," });
		fireEvent.change(input, { target: { value: "List" } });
		fireEvent.keyDown(input, { key: "Enter" });
		fireEvent.change(input, { target: { value: "Admin " } });
		fireEvent.blur(input);
		fireEvent.click(screen.getByRole("button", { name: "Read" }));
		expect(
			screen.getAllByRole("button", { name: /^Remove / }).map((b) => b.getAttribute("aria-label")),
		).toEqual(["Remove List", "Remove Tagging", "Remove Admin", "Remove Read"]);
		fireEvent.keyDown(input, { key: "Backspace" });
		fireEvent.click(screen.getByRole("button", { name: "Remove List" }));
		fireEvent.keyDown(input, { key: "a" });
		await settle();
		expect(
			screen.getAllByRole("button", { name: /^Remove / }).map((b) => b.getAttribute("aria-label")),
		).toEqual(["Remove Tagging", "Remove Admin"]);
		expect(screen.getByRole("button", { name: "Read" })).toBeTruthy();
	});

	test("disabled fields show tokens only", () => {
		render(<TokenField label="Policies" value={["ro"]} onChange={() => {}} suggestions={["rw"]} disabled />);
		expect(screen.getByText("ro")).toBeTruthy();
		expect(screen.queryByRole("button")).toBeNull();
	});
});

describe("NewSecretPanel", () => {
	test("scrambles the secret in when motion is allowed and offers an env snippet", () => {
		setMedia("(prefers-reduced-motion: reduce)", false);
		const writeText = mock(async () => {});
		Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
		const onDone = mock(() => {});
		render(
			<NewSecretPanel
				secret={{ accessKey: "AK", secretKey: "SK" }}
				endpoint={null}
				onDone={onDone}
				doneLabel="Done"
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Copy as environment variables" }));
		expect(writeText).toHaveBeenCalledWith("AWS_ACCESS_KEY_ID=AK\nAWS_SECRET_ACCESS_KEY=SK");
		fireEvent.click(screen.getByRole("button", { name: "Done" }));
		expect(onDone).toHaveBeenCalled();
	});
});

describe("helpers", () => {
	test("describeActions", () => {
		expect(describeActions([])).toBe("No direct permissions");
		expect(describeActions(["Read", "Admin"])).toBe("Full admin");
		expect(describeActions(["Read", "Write:media", "List:media"])).toBe(
			"Read on all buckets; Write, List on media",
		);
	});

	test("NameList collapses long lists", () => {
		render(<NameList names={["a", "b", "c", "d"]} max={2} />);
		expect(screen.getByText("+2")).toBeTruthy();
	});
});
