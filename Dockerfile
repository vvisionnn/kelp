# syntax=docker/dockerfile:1.7
# Kelp: the web console and its API gateway in one small Bun image. The server is bundled into a
# single file, so the runtime image carries no node_modules.

ARG BUN_VERSION=1.4.4

# The build output is platform-independent JS, so build once on the native platform.
FROM --platform=$BUILDPLATFORM oven/bun:${BUN_VERSION} AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .
RUN bun run routes && bun run build && bun run build:server && find dist -name "*.map*" -delete

FROM oven/bun:${BUN_VERSION}-slim
WORKDIR /app
ENV NODE_ENV=production \
	PORT=3000 \
	KELP_STATIC_DIR=/app/dist \
	KELP_PROTO_DIR=/app/proto
COPY --from=build /app/build/server.js ./server.js
COPY --from=build /app/dist ./dist
COPY proto ./proto
USER bun
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
	CMD ["bun", "-e", "const r = await fetch(`http://127.0.0.1:${process.env.PORT}/api/health`); process.exit(r.ok ? 0 : 1)"]
CMD ["bun", "server.js"]
