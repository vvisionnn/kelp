import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { createSessionCodec, type KelpUser, LoginThrottle, verifyCredentials } from "./auth.ts";

const users: KelpUser[] = [
	{ name: "admin", password: "correct horse", role: "admin" },
	{ name: "viewer", password: "look only", role: "viewer" },
];

describe("verifyCredentials", () => {
	test("returns the matching user without the password", () => {
		expect(verifyCredentials(users, "admin", "correct horse")).toEqual({ name: "admin", role: "admin" });
		expect(verifyCredentials(users, "viewer", "look only")).toEqual({ name: "viewer", role: "viewer" });
	});

	test("rejects wrong passwords, unknown users and empty input", () => {
		expect(verifyCredentials(users, "admin", "wrong")).toBeUndefined();
		expect(verifyCredentials(users, "ghost", "correct horse")).toBeUndefined();
		expect(verifyCredentials(users, "", "")).toBeUndefined();
	});
});

describe("session codec", () => {
	const now = 1_000_000;
	const codec = createSessionCodec("secret-key", { ttlSeconds: 60, now: () => now });

	test("round-trips a session", () => {
		const token = codec.encode({ name: "admin", role: "admin" });
		expect(codec.decode(token)).toEqual({ name: "admin", role: "admin" });
	});

	test("rejects expired sessions", () => {
		const token = codec.encode({ name: "admin", role: "admin" });
		const later = createSessionCodec("secret-key", { ttlSeconds: 60, now: () => now + 61_000 });
		expect(later.decode(token)).toBeUndefined();
	});

	test("rejects tampered payloads and signatures", () => {
		const token = codec.encode({ name: "viewer", role: "viewer" });
		const [payload, signature] = token.split(".");
		const forged = Buffer.from(JSON.stringify({ n: "viewer", r: "admin", e: now + 60_000 })).toString(
			"base64url",
		);
		expect(codec.decode(`${forged}.${signature}`)).toBeUndefined();
		expect(codec.decode(`${payload}.${"A".repeat(signature?.length ?? 10)}`)).toBeUndefined();
		expect(createSessionCodec("other-key").decode(token)).toBeUndefined();
	});

	test("rejects malformed tokens", () => {
		for (const token of [
			"",
			"abc",
			"a.b.c",
			"!!!.???",
			`${Buffer.from("not json").toString("base64url")}.x`,
		]) {
			expect(codec.decode(token)).toBeUndefined();
		}
	});
});

test("session codec rejects a correctly signed payload that is not JSON", () => {
	const payload = Buffer.from("not json").toString("base64url");
	const signature = createHmac("sha256", "s3cret").update(payload).digest("base64url");
	expect(createSessionCodec("s3cret").decode(`${payload}.${signature}`)).toBeUndefined();
});

describe("LoginThrottle", () => {
	test("blocks a client after repeated failures until the window passes", () => {
		let now = 0;
		const throttle = new LoginThrottle({ maxFailures: 3, windowMs: 1000, now: () => now });
		for (let i = 0; i < 3; i++) {
			expect(throttle.isBlocked("1.2.3.4")).toBe(false);
			throttle.recordFailure("1.2.3.4");
		}
		expect(throttle.isBlocked("1.2.3.4")).toBe(true);
		expect(throttle.isBlocked("5.6.7.8")).toBe(false);
		now = 1001;
		expect(throttle.isBlocked("1.2.3.4")).toBe(false);
	});

	test("a successful login clears the failure count", () => {
		const throttle = new LoginThrottle({ maxFailures: 2, windowMs: 1000, now: () => 0 });
		throttle.recordFailure("ip");
		throttle.reset("ip");
		throttle.recordFailure("ip");
		expect(throttle.isBlocked("ip")).toBe(false);
	});
});
