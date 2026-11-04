/** Shared settings for the local SeaweedFS stack (scripts/stack.ts) and the seed script. */

export const PORTS = { master: 9333, volume: 8080, filer: 8888, s3: 8333, admin: 23646 } as const;
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
