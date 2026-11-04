import { describe, expect, mock, test } from "bun:test";
import type { ConfigField, JobTypeConfig, RuntimeSettings } from "@shared/maintenance.ts";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { settle } from "../../../../test/settle.ts";
import { diffConfig, isVisible, SettingsForm } from "./settings-form.tsx";

const runtime: RuntimeSettings = {
	enabled: true,
	detectionIntervalMinutes: 17,
	detectionTimeoutSeconds: 120,
	maxJobsPerDetection: 200,
	globalExecutionConcurrency: 16,
	perWorkerExecutionConcurrency: 4,
	retryLimit: 1,
	retryBackoffSeconds: 10,
	jobTypeMaxRuntimeSeconds: 1800,
	executionTimeoutSeconds: 1800,
};

function field(name: string, overrides: Partial<ConfigField> = {}): ConfigField {
	return {
		name,
		label: name[0]?.toUpperCase() + name.slice(1),
		description: `${name} description`,
		help: "",
		placeholder: "",
		type: "string",
		widget: "text",
		required: false,
		readOnly: false,
		sensitive: false,
		min: null,
		max: null,
		options: [],
		visibleWhen: null,
		unsupported: false,
		...overrides,
	};
}

const options = [
	{ value: "ALL", label: "All volumes", description: "", disabled: false },
	{ value: "FULL", label: "Full volumes", description: "", disabled: false },
	{ value: "OFF", label: "Never", description: "", disabled: true },
];

function config(overrides: Partial<JobTypeConfig> = {}): JobTypeConfig {
	return {
		jobType: "demo",
		displayName: "Demo",
		description: "",
		descriptorVersion: 1,
		adminForm: {
			title: "Admin",
			description: "",
			sections: [
				{
					id: "scope",
					title: "Scope",
					description: "What to look at",
					fields: [
						field("mode", { type: "enum", widget: "select", options }),
						field("pattern", { visibleWhen: { field: "mode", equals: "FULL" } }),
						field("kinds", { type: "list", widget: "multiselect", options }),
						field("tags", { type: "list" }),
						field("script", { widget: "textarea" }),
						field("token", { widget: "password", sensitive: true }),
						field("blob", { type: "object", unsupported: true }),
						field("locked", { readOnly: true }),
					],
				},
			],
		},
		workerForm: {
			title: "Worker",
			description: "",
			sections: [
				{
					id: "limits",
					title: "Limits",
					description: "",
					fields: [
						field("threshold", { type: "double", widget: "number", min: 0, max: 1, required: true }),
						field("cooldown", { type: "duration", widget: "duration" }),
						field("fast", { type: "bool", widget: "toggle" }),
					],
				},
			],
		},
		admin: {
			mode: "ALL",
			pattern: "",
			kinds: ["ALL"],
			tags: ["a", "b"],
			script: "echo hi",
			token: null,
			blob: "",
			locked: "x",
		},
		worker: { threshold: 0.3, cooldown: 3600, fast: false },
		secretsSet: ["admin.token"],
		runtime,
		runtimeDefaults: runtime,
		updatedAt: "2026-11-04T00:00:00Z",
		updatedBy: "admin",
		...overrides,
	};
}

describe("form logic", () => {
	test("visibility follows the referenced value", () => {
		const f = field("x", { visibleWhen: { field: "mode", equals: "FULL" } });
		expect(isVisible(f, { mode: "FULL" })).toBe(true);
		expect(isVisible(f, { mode: "ALL" })).toBe(false);
		expect(isVisible(field("y"), {})).toBe(true);
	});

	test("diff only includes what changed", () => {
		const c = config();
		expect(diffConfig(c, { admin: c.admin, worker: c.worker, runtime: c.runtime })).toEqual({
			update: {},
			count: 0,
		});
		const changed = diffConfig(c, {
			admin: { ...c.admin, mode: "FULL" },
			worker: { ...c.worker, threshold: 0.5 },
			runtime: { ...c.runtime, retryLimit: 0 },
		});
		expect(changed).toEqual({
			update: { admin: { mode: "FULL" }, worker: { threshold: 0.5 }, runtime: { retryLimit: 0 } },
			count: 3,
		});
	});
});

describe("SettingsForm", () => {
	test("renders every kind of control with current values", () => {
		render(<SettingsForm config={config()} canWrite onSave={async () => {}} />);
		expect((screen.getByLabelText("Detection interval") as HTMLInputElement).value).toBe("17");
		expect(screen.getAllByText("30 min")).toHaveLength(2);
		expect(screen.getByRole("combobox", { name: "Mode" })).toBeTruthy();
		expect(screen.queryByLabelText("Pattern")).toBeNull();
		expect((screen.getByLabelText("Tags") as HTMLInputElement).value).toBe("a, b");
		expect((screen.getByLabelText("Script") as HTMLTextAreaElement).value).toBe("echo hi");
		expect((screen.getByLabelText("Token") as HTMLInputElement).placeholder).toBe("Saved. Type to replace.");
		expect(screen.getByText(/Kelp keeps the current value/)).toBeTruthy();
		expect((screen.getByLabelText("Locked") as HTMLInputElement).disabled).toBe(true);
		expect((screen.getByLabelText("Threshold") as HTMLInputElement).value).toBe("0.3");
		expect(screen.getByText("1 hr")).toBeTruthy();
		expect(
			(screen.getByRole("checkbox", { name: "Never" }) as HTMLElement).hasAttribute("data-disabled"),
		).toBe(true);
		expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull();
	});

	test("edits show a save bar, validate, and save only the changes", async () => {
		const onSave = mock(async (_update: unknown) => {});
		render(<SettingsForm config={config()} canWrite onSave={onSave} />);
		fireEvent.change(screen.getByLabelText("Threshold"), { target: { value: "2" } });
		const bar = await screen.findByRole("region", { name: "Unsaved changes" });
		expect(within(bar).getByText("Fix the highlighted values to save.")).toBeTruthy();
		expect(screen.getByRole("alert").textContent).toBe("Threshold must be at most 1");
		expect((within(bar).getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(
			true,
		);

		fireEvent.change(screen.getByLabelText("Threshold"), { target: { value: "0.5" } });
		fireEvent.change(screen.getByLabelText("Retry limit"), { target: { value: "" } });
		fireEvent.change(screen.getByLabelText("Retry limit"), { target: { value: "3" } });
		fireEvent.click(screen.getByRole("switch", { name: "Run automatically" }));
		fireEvent.click(screen.getByRole("switch", { name: "Fast" }));
		fireEvent.change(screen.getByLabelText("Script"), { target: { value: "echo bye" } });
		fireEvent.change(screen.getByLabelText("Token"), { target: { value: "new-secret" } });
		fireEvent.change(screen.getByLabelText("Cooldown"), { target: { value: "" } });
		fireEvent.click(screen.getByRole("checkbox", { name: "Full volumes" }));
		fireEvent.change(screen.getByLabelText("Tags"), { target: { value: "a, b, c," } });
		expect((screen.getByLabelText("Tags") as HTMLInputElement).value).toBe("a, b, c,");
		fireEvent.blur(screen.getByLabelText("Tags"));
		expect((screen.getByLabelText("Tags") as HTMLInputElement).value).toBe("a, b, c");
		expect(within(bar).getByText("9")).toBeTruthy();

		fireEvent.click(within(bar).getByRole("button", { name: "Save changes" }));
		await waitFor(() => expect(onSave).toHaveBeenCalled());
		expect(onSave.mock.calls[0]).toEqual([
			{
				admin: { kinds: ["ALL", "FULL"], tags: ["a", "b", "c"], script: "echo bye", token: "new-secret" },
				worker: { threshold: 0.5, cooldown: null, fast: true },
				runtime: { enabled: false, retryLimit: 3 },
			},
		]);
	});

	test("unchecking options, clearing a secret and discarding", async () => {
		render(<SettingsForm config={config()} canWrite onSave={async () => {}} />);
		fireEvent.click(screen.getByRole("checkbox", { name: "All volumes" }));
		fireEvent.change(screen.getByLabelText("Token"), { target: { value: "x" } });
		fireEvent.change(screen.getByLabelText("Token"), { target: { value: "" } });
		const bar = await screen.findByRole("region", { name: "Unsaved changes" });
		expect(within(bar).getByText("1")).toBeTruthy();
		expect(within(bar).getByText(/unsaved change$/)).toBeTruthy();
		fireEvent.click(within(bar).getByRole("button", { name: "Discard" }));
		await settle();
		expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull();
	});

	test("conditional fields appear when their condition holds", () => {
		render(
			<SettingsForm
				config={config({ admin: { ...config().admin, mode: "FULL" } })}
				canWrite
				onSave={async () => {}}
			/>,
		);
		expect(screen.getByLabelText("Pattern")).toBeTruthy();
	});

	test("a failed save keeps the edits", async () => {
		const onSave = mock(async () => {
			throw new Error("nope");
		});
		render(<SettingsForm config={config()} canWrite onSave={onSave} />);
		fireEvent.change(screen.getByLabelText("Detection interval"), { target: { value: "30" } });
		const bar = await screen.findByRole("region", { name: "Unsaved changes" });
		await act(async () => {
			fireEvent.submit(within(bar).getByRole("button", { name: "Save changes" }));
		});
		expect(onSave).toHaveBeenCalled();
		expect((screen.getByLabelText("Detection interval") as HTMLInputElement).value).toBe("30");
	});

	test("an empty form cannot be submitted", () => {
		const onSave = mock(async () => {});
		const { container } = render(<SettingsForm config={config()} canWrite onSave={onSave} />);
		fireEvent.submit(container.querySelector("form") as HTMLFormElement);
		expect(onSave).not.toHaveBeenCalled();
	});

	test("viewers see values but cannot change them", () => {
		render(<SettingsForm config={config({ adminForm: null })} canWrite={false} onSave={async () => {}} />);
		expect(screen.getByText(/You have read-only access/)).toBeTruthy();
		expect((screen.getByLabelText("Detection interval") as HTMLInputElement).disabled).toBe(true);
		expect(screen.queryByLabelText("Mode")).toBeNull();
	});

	test("selecting an option changes the value", async () => {
		render(<SettingsForm config={config()} canWrite onSave={async () => {}} />);
		const trigger = screen.getByRole("combobox", { name: "Mode" });
		fireEvent.pointerDown(trigger, { pointerType: "mouse", button: 0 });
		fireEvent.mouseDown(trigger);
		fireEvent.click(trigger);
		const option = await screen.findByRole("option", { name: "Full volumes" });
		fireEvent.pointerDown(option, { pointerType: "mouse", button: 0 });
		fireEvent.mouseUp(option);
		fireEvent.pointerUp(option, { pointerType: "mouse", button: 0 });
		fireEvent.click(option);
		expect(await screen.findByLabelText("Pattern")).toBeTruthy();
	});
});
