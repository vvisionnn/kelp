import { fireEvent } from "@testing-library/react";

/**
 * Picks a segment of a segmented control the way a pointer does: press on it, release on the
 * track. (React Bits RubberSegment listens to pointer and key events, not clicks.)
 */
export function pickSegment(segment: HTMLElement) {
	fireEvent.pointerDown(segment, { pointerId: 1, button: 0 });
	fireEvent.pointerUp(segment.closest("[role=radiogroup]") as HTMLElement, { pointerId: 1, button: 0 });
}
