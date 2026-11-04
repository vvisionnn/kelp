import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Role, SessionUser } from "../shared/api.ts";

export interface KelpUser extends SessionUser {
	password: string;
}

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Constant-time check of a username/password pair against the configured users. */
export function verifyCredentials(
	users: KelpUser[],
	name: string,
	password: string,
): SessionUser | undefined {
	if (!name || !password) return undefined;
	let match: SessionUser | undefined;
	for (const user of users) {
		// Compare digests so every candidate costs the same regardless of length or position.
		const nameOk = timingSafeEqual(digest(user.name), digest(name));
		const passwordOk = timingSafeEqual(digest(user.password), digest(password));
		if (nameOk && passwordOk) match = { name: user.name, role: user.role };
	}
	return match;
}

export interface SessionCodec {
	encode(user: SessionUser): string;
	decode(token: string): SessionUser | undefined;
}

/** Stateless signed sessions: `base64url(payload).base64url(hmac)`. */
export function createSessionCodec(
	secret: string,
	options: { ttlSeconds?: number; now?: () => number } = {},
): SessionCodec {
	const ttlMs = (options.ttlSeconds ?? 12 * 60 * 60) * 1000;
	const now = options.now ?? Date.now;
	const sign = (payload: string) => createHmac("sha256", secret).update(payload).digest("base64url");

	return {
		encode(user) {
			const payload = Buffer.from(JSON.stringify({ n: user.name, r: user.role, e: now() + ttlMs })).toString(
				"base64url",
			);
			return `${payload}.${sign(payload)}`;
		},
		decode(token) {
			const parts = token.split(".");
			if (parts.length !== 2) return undefined;
			const [payload = "", signature = ""] = parts;
			const expected = Buffer.from(sign(payload));
			const actual = Buffer.from(signature);
			if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return undefined;
			try {
				const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
					n: string;
					r: Role;
					e: number;
				};
				if (typeof data.e !== "number" || data.e <= now()) return undefined;
				return { name: data.n, role: data.r };
			} catch {
				return undefined;
			}
		},
	};
}

/** Per-client failed-login counter that blocks brute force for a sliding window. */
export class LoginThrottle {
	private readonly failures = new Map<string, number[]>();
	private readonly maxFailures: number;
	private readonly windowMs: number;
	private readonly now: () => number;

	constructor(options: { maxFailures?: number; windowMs?: number; now?: () => number } = {}) {
		this.maxFailures = options.maxFailures ?? 10;
		this.windowMs = options.windowMs ?? 15 * 60 * 1000;
		this.now = options.now ?? Date.now;
	}

	isBlocked(client: string): boolean {
		return this.recent(client).length >= this.maxFailures;
	}

	recordFailure(client: string): void {
		this.failures.set(client, [...this.recent(client), this.now()]);
	}

	reset(client: string): void {
		this.failures.delete(client);
	}

	private recent(client: string): number[] {
		const cutoff = this.now() - this.windowMs;
		return (this.failures.get(client) ?? []).filter((time) => time > cutoff);
	}
}
