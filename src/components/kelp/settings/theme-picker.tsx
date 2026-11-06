import { type Theme, useTheme } from "@/components/theme-provider.tsx";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

const THEMES: Array<{ value: Theme; label: string }> = [
	{ value: "system", label: "Automatic" },
	{ value: "light", label: "Light" },
	{ value: "dark", label: "Dark" },
];

const PREVIEW = {
	light: {
		canvas: "#f5f5f7",
		sidebar: "#ffffff",
		current: "rgb(85 82 224 / 0.16)",
		sheet: "#ffffff",
		line: "rgb(0 0 0 / 0.1)",
		edge: "rgb(0 0 0 / 0.08)",
	},
	dark: {
		canvas: "#0e0e10",
		sidebar: "#161618",
		current: "rgb(143 140 255 / 0.2)",
		sheet: "#1c1c1e",
		line: "rgb(255 255 255 / 0.14)",
		edge: "rgb(255 255 255 / 0.08)",
	},
};

const ROWS = [0, 1, 2, 3];

/** A tiny drawing of Kelp in a palette: the docked sidebar on its own surface with the current page tinted, and sheets. */
function ThemePreview({ mode }: { mode: "light" | "dark" }) {
	const c = PREVIEW[mode];
	const edge = { boxShadow: `0 0 0 0.5px ${c.edge}` };
	return (
		<div className="flex h-full w-full" style={{ background: c.canvas }}>
			<div
				className="flex w-[30%] flex-col gap-1 p-1.5 pt-2"
				style={{ background: c.sidebar, boxShadow: `0.5px 0 0 ${c.edge}` }}
			>
				{ROWS.map((row) => (
					<span
						key={row}
						className="flex items-center gap-1 rounded-[3px] px-0.5 py-[1px]"
						style={row === 1 ? { background: c.current } : undefined}
					>
						<span className="size-1.5 rounded-[2px]" style={{ background: c.line }} />
						<span className="h-1 flex-1 rounded-full" style={{ background: c.line }} />
					</span>
				))}
			</div>
			<div className="flex flex-1 flex-col gap-1.5 p-1.5 pt-2">
				<span className="h-1.5 w-1/2 rounded-full" style={{ background: c.line }} />
				<div className="flex gap-1.5">
					{[0, 1].map((i) => (
						<span key={i} className="h-5 flex-1 rounded-[4px]" style={{ background: c.sheet, ...edge }} />
					))}
				</div>
				<span className="flex-1 rounded-[4px]" style={{ background: c.sheet, ...edge }} />
			</div>
		</div>
	);
}

export function ThemePicker() {
	const { theme, setTheme } = useTheme();
	return (
		<RadioGroup
			value={theme}
			onValueChange={(value) => setTheme(value as Theme)}
			aria-label="Theme"
			className="flex flex-wrap gap-5"
		>
			{THEMES.map((option) => {
				const selected = theme === option.value;
				return (
					<label
						key={option.value}
						htmlFor={`theme-${option.value}`}
						className="group flex w-32 cursor-pointer flex-col items-center gap-2"
					>
						<div
							className={cn(
								"aspect-[16/10] w-full overflow-hidden rounded-lg ring-1 ring-border transition-shadow group-has-focus-visible:ring-3 group-has-focus-visible:ring-primary/40",
								selected && "ring-2 ring-primary",
							)}
						>
							{option.value === "system" ? (
								<div className="relative h-full w-full">
									<ThemePreview mode="light" />
									<div className="absolute inset-0 [clip-path:polygon(50%_0,100%_0,100%_100%,50%_100%)]">
										<ThemePreview mode="dark" />
									</div>
								</div>
							) : (
								<ThemePreview mode={option.value} />
							)}
						</div>
						<span className="flex items-center gap-1.5">
							<RadioGroupItem
								id={`theme-${option.value}`}
								value={option.value}
								aria-label={option.label}
								className="sr-only"
							/>
							<span className={cn("text-[13px]", selected && "font-semibold")}>{option.label}</span>
						</span>
					</label>
				);
			})}
		</RadioGroup>
	);
}
