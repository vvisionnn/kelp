import { join, normalize, resolve, sep } from "node:path";
import { Hono, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { SessionUser } from "../shared/api.ts";
import { createSessionCodec, LoginThrottle, verifyCredentials } from "./auth.ts";
import type { KelpConfig } from "./config.ts";
import { UpstreamError } from "./upstream/http.ts";

export const SESSION_COOKIE = "kelp_session";
/** Header the web client sends on every write. Cross-site forms cannot set it without CORS. */
export const CSRF_HEADER = "x-kelp-csrf";

export type Env = { Variables: { user: SessionUser } };

export interface AppOptions {
	config: KelpConfig;
	/** Feature routers mounted under `/api`. */
	routes: Array<[path: string, router: Hono<Env>]>;
}

const loginBody = z.object({ username: z.string(), password: z.string() });
const isWrite = (method: string) => !["GET", "HEAD", "OPTIONS"].includes(method);

export function createApp({ config, routes }: AppOptions) {
	const sessions = createSessionCodec(config.sessionSecret, { ttlSeconds: config.sessionTtlSeconds });
	const throttle = new LoginThrottle();
	const app = new Hono<Env>();

	app.onError((error, c) => {
		if (error instanceof UpstreamError) {
			return c.json({ error: error.message, upstream: error.upstream }, error.status as 500);
		}
		if (error instanceof z.ZodError) {
			const issue = error.issues[0];
			return c.json(
				{ error: issue ? `${issue.path.join(".") || "input"}: ${issue.message}` : "Invalid input" },
				400,
			);
		}
		console.error(error);
		return c.json({ error: "Something went wrong in Kelp. Check the server logs." }, 500);
	});

	const api = new Hono<Env>();

	const requireCsrf: MiddlewareHandler<Env> = async (c, next) => {
		if (isWrite(c.req.method) && c.req.header(CSRF_HEADER) !== "1") {
			return c.json({ error: "Missing request verification header" }, 403);
		}
		await next();
	};
	api.use("*", requireCsrf);

	api.get("/health", (c) => c.json({ ok: true }));

	api.post("/auth/login", async (c) => {
		const client = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local";
		if (throttle.isBlocked(client)) {
			return c.json({ error: "Too many failed sign-ins. Try again in a few minutes." }, 429);
		}
		const { username, password } = loginBody.parse(await c.req.json());
		const user = verifyCredentials(config.users, username, password);
		if (!user) {
			throttle.recordFailure(client);
			return c.json({ error: "Wrong username or password" }, 401);
		}
		throttle.reset(client);
		setCookie(c, SESSION_COOKIE, sessions.encode(user), {
			httpOnly: true,
			sameSite: "Lax",
			path: "/",
			secure: c.req.header("x-forwarded-proto") === "https" || new URL(c.req.url).protocol === "https:",
			maxAge: config.sessionTtlSeconds,
		});
		return c.json({ user });
	});

	api.post("/auth/logout", (c) => {
		deleteCookie(c, SESSION_COOKIE, { path: "/" });
		return c.json({ ok: true });
	});

	api.use("*", async (c, next) => {
		const user = sessions.decode(getCookie(c, SESSION_COOKIE) ?? "");
		if (!user) return c.json({ error: "Sign in to continue" }, 401);
		if (isWrite(c.req.method) && user.role !== "admin") {
			return c.json({ error: "Your account is read-only" }, 403);
		}
		c.set("user", user);
		await next();
	});

	api.get("/auth/me", (c) => c.json({ user: c.get("user") }));

	for (const [path, router] of routes) api.route(path, router);
	api.all("*", (c) => c.json({ error: "Not found" }, 404));

	app.route("/api", api);
	app.get("*", (c) => serveStatic(config.staticDir, c.req.path));
	return app;
}

async function serveStatic(dir: string, path: string): Promise<Response> {
	const root = resolve(dir);
	const target = resolve(join(root, normalize(decodeURIComponent(path))));
	if (target.startsWith(root + sep)) {
		const file = Bun.file(target);
		if (await file.exists()) {
			const immutable = target.includes(`${sep}assets${sep}`);
			return new Response(file, {
				headers: { "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache" },
			});
		}
	}
	return new Response(Bun.file(join(root, "index.html")), {
		headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
	});
}
