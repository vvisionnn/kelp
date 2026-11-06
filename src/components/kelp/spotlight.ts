import { useEffect } from "react";

/**
 * A soft light that follows the cursor across sheets, drawn by `.group-sheet::after` from these
 * custom properties. One listener serves the whole app, and it only runs where a pointer can hover.
 */
export function useSpotlight() {
	useEffect(() => {
		if (!window.matchMedia("(hover: hover)").matches) return;
		let lit: HTMLElement | null = null;
		const onMove = (event: PointerEvent) => {
			const sheet = (event.target as Element | null)?.closest?.<HTMLElement>(".group-sheet") ?? null;
			if (lit && lit !== sheet) lit.style.removeProperty("--spot");
			lit = sheet;
			if (!sheet) return;
			const box = sheet.getBoundingClientRect();
			sheet.style.setProperty("--spot", "1");
			sheet.style.setProperty("--spot-x", `${event.clientX - box.left}px`);
			sheet.style.setProperty("--spot-y", `${event.clientY - box.top}px`);
		};
		document.addEventListener("pointermove", onMove, { passive: true });
		return () => {
			document.removeEventListener("pointermove", onMove);
			lit?.style.removeProperty("--spot");
		};
	}, []);
}
