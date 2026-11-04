/** Preload for client tests: a happy-dom window plus the browser APIs UI libraries expect. */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost:3000/", width: 1280, height: 800 });

// happy-dom's Web Animations reject `finished` on cancel; run motion instantly instead.
const { MotionGlobalConfig } = await import("motion/react");
MotionGlobalConfig.skipAnimations = true;
Element.prototype.animate = undefined as unknown as Element["animate"];

const { afterEach } = await import("bun:test");
const { cleanup } = await import("@testing-library/react");
const { toast } = await import("sonner");

const realFetch = globalThis.fetch;

afterEach(() => {
	cleanup();
	// Sonner keeps toasts in a module-level store; a new Toaster would re-show the last test's.
	toast.dismiss();
	globalThis.fetch = realFetch;
	localStorage.clear();
	document.documentElement.className = "";
	resetMedia();
});

class Observer {
	observe() {}
	unobserve() {}
	disconnect() {}
	takeRecords() {
		return [];
	}
}
Object.assign(globalThis, { ResizeObserver: Observer, IntersectionObserver: Observer });

const { matchMediaStub, resetMedia } = await import("./media.ts");
resetMedia();
window.matchMedia = matchMediaStub;

// Silence React's act() environment warning.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
