import { act } from "@testing-library/react";

/** Lets motion finish exit animations (instant in tests, but still a frame away). */
export async function settle(ms = 50) {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, ms));
	});
}
