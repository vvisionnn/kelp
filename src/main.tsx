import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { ThemeProvider } from "./components/theme-provider.tsx";
import { reloadForNewBuild } from "./lib/stale-build.ts";
import { createAppRouter, createQueryClient } from "./router.tsx";

// A page's code from an older build is gone after an upgrade: load the new build instead of failing.
window.addEventListener("vite:preloadError", (event) => {
	if (reloadForNewBuild(() => window.location.reload())) event.preventDefault();
});

const queryClient = createQueryClient();
const router = createAppRouter(queryClient);

const root = document.getElementById("root");
if (root) {
	createRoot(root).render(
		<StrictMode>
			<ThemeProvider>
				<QueryClientProvider client={queryClient}>
					<RouterProvider router={router} />
				</QueryClientProvider>
			</ThemeProvider>
		</StrictMode>,
	);
}
