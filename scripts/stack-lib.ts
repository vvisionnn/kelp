/** Shared settings for the local SeaweedFS stack (scripts/stack.ts) and the seed script. */

export const PORTS = {
	master: 9333,
	volume: 8080,
	filer: 8888,
	s3: 8333,
	iceberg: 8181,
	admin: 12535,
} as const;
export type Ports = { [K in keyof typeof PORTS]: number };

/** Default ports shifted by `offset`, so a second stack (e2e) can run beside the dev one. */
export function stackPorts(offset = 0): Ports {
	return {
		master: PORTS.master + offset,
		volume: PORTS.volume + offset,
		filer: PORTS.filer + offset,
		s3: PORTS.s3 + offset,
		iceberg: PORTS.iceberg + offset,
		admin: PORTS.admin + offset,
	};
}

/** Environment that points a Kelp server at a stack started with the same offset. */
export function kelpEnv(ports: Ports): Record<string, string> {
	return {
		KELP_ADMIN_URL: `http://127.0.0.1:${ports.admin}`,
		KELP_MASTER_URL: `http://127.0.0.1:${ports.master}`,
		KELP_FILER_URL: `http://127.0.0.1:${ports.filer}`,
		KELP_S3_ENDPOINT: `http://127.0.0.1:${ports.s3}`,
	};
}
export const S3_CREDENTIALS = { accessKey: "kelp-dev-access-key", secretKey: "kelp-dev-secret-key" } as const;

/**
 * Polls `url` until it answers with a non-5xx status. Returns false once `timeoutMs` passes.
 * The short poll interval keeps startup fast; the deadline keeps failures bounded.
 */
export async function waitForHttp(
	url: string,
	{ timeoutMs = 60_000, intervalMs = 200 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
			if (response.status < 500) return true;
		} catch {
			// not listening yet
		}
		await Bun.sleep(intervalMs);
	}
	return false;
}

/** Polls `check` until it returns true. Same bounded, fast cadence as `waitForHttp`. */
export async function waitFor(
	check: () => Promise<boolean>,
	{ timeoutMs = 60_000, intervalMs = 200 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await check().catch(() => false)) return true;
		await Bun.sleep(intervalMs);
	}
	return false;
}
