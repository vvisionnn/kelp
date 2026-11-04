import { Component, lazy, type ReactNode, Suspense, useEffect, useState } from "react";
import { canUseWebGL2, usePrefersReducedMotion } from "./motion.ts";

const Threads = lazy(() => import("@/components/react-bits/Threads.tsx"));

class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
	state = { failed: false };
	static getDerivedStateFromError() {
		return { failed: true };
	}
	render() {
		return this.state.failed ? null : this.props.children;
	}
}

function usePageVisible(): boolean {
	const [visible, setVisible] = useState(() => document.visibilityState !== "hidden");
	useEffect(() => {
		const update = () => setVisible(document.visibilityState !== "hidden");
		document.addEventListener("visibilitychange", update);
		return () => document.removeEventListener("visibilitychange", update);
	}, []);
	return visible;
}

/**
 * Kelp's signature moment: strands drifting like a kelp forest in a current. Rendered only when
 * WebGL2 is available and the user has not asked for reduced motion; paused in background tabs.
 */
export function AmbientThreads({ color, className }: { color: string; className?: string }) {
	const reduced = usePrefersReducedMotion();
	const visible = usePageVisible();
	const [webgl] = useState(canUseWebGL2);
	if (reduced || !webgl) return null;
	return (
		<Quiet>
			<Suspense fallback={null}>
				<Threads
					className={className}
					color={color}
					amplitude={1.1}
					distance={0.2}
					lineCount={22}
					thickness={1.2}
					speed={0.35}
					waves={2}
					angle={90}
					fade={0.6}
					opacity={0.8}
					paused={!visible}
				/>
			</Suspense>
		</Quiet>
	);
}
