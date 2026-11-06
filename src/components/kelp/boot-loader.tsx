import LatticeLoader from "@/components/react-bits/LatticeLoader.tsx";

/** Full-screen loader while Kelp checks the session before showing the console. */
export function BootLoader() {
	return (
		<main
			className="kelp-skeleton-in flex min-h-svh items-center justify-center bg-background"
			role="status"
			aria-live="polite"
		>
			<LatticeLoader
				pattern="ripple"
				label="Connecting to your cluster"
				color="var(--primary)"
				glow
				glowColor="var(--primary)"
				cellSize={10}
				gap={4}
			/>
		</main>
	);
}
