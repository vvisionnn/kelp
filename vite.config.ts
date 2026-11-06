import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * Writes a brotli and a gzip copy beside every text file of the build, compressed once at their
 * best settings, so the server sends the smallest file a browser accepts without compressing live.
 */
function precompress(): Plugin {
	let outDir = "dist";
	return {
		name: "kelp-precompress",
		apply: "build",
		configResolved(config) {
			outDir = resolve(config.root, config.build.outDir);
		},
		closeBundle() {
			const walk = (dir: string): string[] =>
				readdirSync(dir).flatMap((name) => {
					const path = join(dir, name);
					return statSync(path).isDirectory() ? walk(path) : [path];
				});
			for (const path of walk(outDir)) {
				if (!/\.(js|css|html|svg|json|txt|webmanifest)$/.test(path)) continue;
				const source = readFileSync(path);
				if (source.length < 1024) continue;
				writeFileSync(
					`${path}.br`,
					brotliCompressSync(source, {
						params: {
							[constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
							[constants.BROTLI_PARAM_SIZE_HINT]: source.length,
						},
					}),
				);
				writeFileSync(`${path}.gz`, gzipSync(source, { level: 9 }));
			}
		},
	};
}

export default defineConfig({
	plugins: [
		tanstackRouter({
			target: "react",
			autoCodeSplitting: true,
			// Every signed-in page sits inside the shell, so it ships with the app instead of after it.
			codeSplittingOptions: { splitBehavior: ({ routeId }) => (routeId === "/_app" ? [] : undefined) },
		}),
		react(),
		tailwindcss(),
		precompress(),
	],
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
	build: {
		outDir: "dist",
		sourcemap: true,
		rolldownOptions: {
			output: {
				// Libraries in a few files of their own: fewer requests on a first visit, and they stay
				// cached across Kelp releases because their contents (and so their names) don't change.
				codeSplitting: {
					groups: [
						{ name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 40 },
						{
							name: "tanstack",
							test: /node_modules[\\/]@tanstack[\\/](react-router|router-core|history|react-query|query-core|react-store|store)[\\/]/,
							priority: 30,
						},
						{
							name: "motion",
							test: /node_modules[\\/](motion|motion-dom|motion-utils|framer-motion)[\\/]/,
							priority: 30,
						},
						{ name: "icons", test: /node_modules[\\/]lucide-react[\\/]/, priority: 20 },
					],
				},
			},
		},
	},
});
