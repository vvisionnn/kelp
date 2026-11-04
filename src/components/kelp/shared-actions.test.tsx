import { describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { useAction } from "@/lib/mutations.ts";
import { settle } from "../../../test/settle.ts";
import { ThemeProvider } from "../theme-provider.tsx";
import { ConfirmDialog } from "./confirm-dialog.tsx";
import { CopyButton } from "./copy-button.tsx";

function wrap(children: ReactNode, client = new QueryClient()) {
	return (
		<ThemeProvider>
			<QueryClientProvider client={client}>
				{children}
				<Toaster />
			</QueryClientProvider>
		</ThemeProvider>
	);
}

function ActionProbe({
	run,
	invalidate,
}: {
	run: (name: string) => Promise<string>;
	invalidate?: string[][];
}) {
	const onSuccess = mock(() => {});
	const action = useAction({
		run,
		success: (out, name) => `Created ${name} (${out})`,
		...(invalidate ? { invalidate } : {}),
		onSuccess,
	});
	return (
		<button type="button" onClick={() => action.mutate("media")}>
			go
		</button>
	);
}

function Plain() {
	const fail = useAction({ run: () => Promise.reject("nope"), success: "never" });
	const ok = useAction({ run: async () => 1, success: "Saved" });
	return (
		<>
			<button type="button" onClick={() => fail.mutate()}>
				fail
			</button>
			<button type="button" onClick={() => ok.mutate()}>
				ok
			</button>
		</>
	);
}

describe("useAction", () => {
	test("toasts success and refreshes the named queries", async () => {
		const client = new QueryClient();
		const invalidate = mock(client.invalidateQueries.bind(client));
		client.invalidateQueries = invalidate as typeof client.invalidateQueries;
		render(wrap(<ActionProbe run={async () => "ok"} invalidate={[["buckets"]]} />, client));
		fireEvent.click(screen.getByText("go"));
		expect(await screen.findByText("Created media (ok)")).toBeTruthy();
		expect(invalidate).toHaveBeenCalledWith({ queryKey: ["buckets"] });
	});

	test("toasts the error message", async () => {
		render(
			wrap(
				<ActionProbe
					run={async () => {
						throw new Error("Bucket already exists");
					}}
				/>,
			),
		);
		fireEvent.click(screen.getByText("go"));
		expect(await screen.findByText("Bucket already exists")).toBeTruthy();
	});

	test("falls back to a generic message for non-errors and plain-string success", async () => {
		render(wrap(<Plain />));
		fireEvent.click(screen.getByText("fail"));
		expect(await screen.findByText("Something went wrong")).toBeTruthy();
		fireEvent.click(screen.getByText("ok"));
		expect(await screen.findByText("Saved")).toBeTruthy();
	});
});

describe("ConfirmDialog", () => {
	test("requires the typed name before a destructive action, then closes", async () => {
		const onConfirm = mock(async () => {});
		render(
			<ConfirmDialog
				trigger={<button type="button">Delete</button>}
				title="Delete bucket media?"
				description="Every object is removed."
				confirmLabel="Delete bucket"
				destructive
				typeToConfirm="media"
				onConfirm={onConfirm}
			/>,
		);
		fireEvent.click(screen.getByText("Delete"));
		const confirm = await screen.findByRole("button", { name: "Delete bucket" });
		expect((confirm as HTMLButtonElement).disabled).toBe(true);
		fireEvent.change(screen.getByRole("textbox"), { target: { value: "media" } });
		fireEvent.click(confirm);
		await waitFor(() => expect(onConfirm).toHaveBeenCalled());
		await settle(300);
		expect(screen.queryByText("Delete bucket media?")).toBeNull();
	});

	test("stays open when the action fails, and resets when cancelled", async () => {
		render(
			<ConfirmDialog
				trigger={<button type="button">Vacuum</button>}
				title="Vacuum now?"
				description="Reclaims space."
				confirmLabel="Vacuum"
				onConfirm={() => Promise.reject(new Error("busy"))}
			/>,
		);
		fireEvent.click(screen.getByText("Vacuum"));
		fireEvent.click(await screen.findByRole("button", { name: "Vacuum" }));
		await settle();
		expect(screen.getByText("Vacuum now?")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		await settle(300);
		expect(screen.queryByText("Vacuum now?")).toBeNull();
	});
});

describe("CopyButton", () => {
	test("copies and briefly confirms", async () => {
		const writeText = mock(async () => {});
		Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
		render(<CopyButton value="AKIA123" label="Copy access key" />);
		fireEvent.click(screen.getByRole("button", { name: "Copy access key" }));
		expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
		expect(writeText).toHaveBeenCalledWith("AKIA123");
		await settle(1600);
		expect(screen.getByRole("button", { name: "Copy access key" })).toBeTruthy();
	});
});
