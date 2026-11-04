import { fireEvent, screen } from "@testing-library/react";

/** Opens the Base UI select named `label` and picks `option` with a real pointer sequence. */
export async function choose(label: string, option: string) {
	fireEvent.click(await screen.findByRole("combobox", { name: label }));
	const item = await screen.findByRole("option", { name: option });
	fireEvent.pointerDown(item);
	fireEvent.mouseDown(item);
	fireEvent.pointerUp(item);
	fireEvent.mouseUp(item);
	fireEvent.click(item);
}
