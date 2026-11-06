import { useEffect } from "react";

/**
 * A soft light that follows the cursor across sheets, drawn by `.group-sheet::after` from these
 * custom properties. One listener serves the whole app, and it only runs where a pointer can hover.
 * Pointer events can outpace the display, so the light moves at most once a frame.
 */
export function useSpotlight() {
	useEffect(() => {
		if (!window.matchMedia("(hover: hover)").matches) return;
		let lit: HTMLElement | null = null;
		let pending: PointerEvent | null = null;
		let frame = 0;
		const paint = () => {
			frame = 0;
			const event = pending;
			pending = null;
			if (!event) return;
			const sheet = (event.target as Element | null)?.closest?.<HTMLElement>(".group-sheet") ?? null;
			if (lit && lit !== sheet) lit.style.removeProperty("--spot");
			lit = sheet;
			if (!sheet) return;
			const box = sheet.getBoundingClientRect();
			sheet.style.setProperty("--spot", "1");
			sheet.style.setProperty("--spot-x", `${event.clientX - box.left}px`);
			sheet.style.setProperty("--spot-y", `${event.clientY - box.top}px`);
		};
		const onMove = (event: PointerEvent) => {
			pending = event;
			if (!frame) frame = requestAnimationFrame(paint);
		};
		document.addEventListener("pointermove", onMove, { passive: true });
		return () => {
			document.removeEventListener("pointermove", onMove);
			cancelAnimationFrame(frame);
			lit?.style.removeProperty("--spot");
		};
	}, []);
}
