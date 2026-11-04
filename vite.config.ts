import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
	resolve: {
		alias: {
			"@": resolve(import.meta.dirname, "./src"),
			"@shared": resolve(import.meta.dirname, "./shared"),
		},
	},
	server: {
		port: 5173,
		proxy: { "/api": { target: `http://127.0.0.1:${process.env.KELP_PORT ?? 3001}`, changeOrigin: false } },
	},
	build: { outDir: "dist", sourcemap: true },
});
