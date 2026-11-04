import { Component, lazy, type ReactNode, Suspense, useEffect, useState } from "react";
import { canUseWebGL2, usePrefersReducedMotion } from "./motion.ts";

const LightRays = lazy(() => import("@/components/react-bits/LightRays.tsx"));

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
 * Light falling through water from above: the sign-in page's one moment. Rendered only when WebGL2
 * is available and the user has not asked for reduced motion; unmounted in background tabs.
 */
export function AmbientRays({
	color,
	light,
	className,
}: {
	color: string;
	light: boolean;
	className?: string;
}) {
	const reduced = usePrefersReducedMotion();
	const visible = usePageVisible();
	const [webgl] = useState(canUseWebGL2);
	if (reduced || !webgl || !visible) return null;
	return (
		<Quiet>
			<Suspense fallback={null}>
				<LightRays
					className={className}
					raysOrigin="top-center"
					raysColor={color}
					raysSpeed={0.6}
					lightSpread={0.9}
					rayLength={1.6}
					fadeDistance={1.1}
					saturation={1.2}
					followMouse
					mouseInfluence={0.08}
					noiseAmount={0.06}
					distortion={0.04}
					lightMode={light}
				/>
			</Suspense>
		</Quiet>
	);
}
