import { act, fireEvent, screen } from "@testing-library/react";

/** Picks an option from a Base UI select, which reacts to pointer events rather than plain clicks. */
export async function choose(trigger: HTMLElement, option: string) {
	fireEvent.click(trigger);
	const item = await screen.findByRole("option", { name: option });
	await act(async () => {
		fireEvent.pointerDown(item);
		fireEvent.pointerUp(item);
		fireEvent.click(item);
	});
}

/**
 * happy-dom lays nothing out, so the virtualized file list would measure a 0px viewport and render
 * no rows. Give that one element a desktop-sized box.
 */
for (const [property, size] of [
	["clientHeight", 640],
	["clientWidth", 960],
] as const) {
	let owner: object | null = HTMLElement.prototype;
	let descriptor: PropertyDescriptor | undefined;
	while (owner && !descriptor) {
		descriptor = Object.getOwnPropertyDescriptor(owner, property);
		owner = Object.getPrototypeOf(owner);
	}
	Object.defineProperty(HTMLElement.prototype, property, {
		configurable: true,
		get(this: HTMLElement) {
			return this.getAttribute("data-testid") === "file-list" ? size : descriptor?.get?.call(this);
		},
	});
}
