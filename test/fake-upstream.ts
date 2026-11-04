/**
 * Fake SeaweedFS HTTP component for server tests. Routes answer with captured fixtures from a
 * real 4.52 cluster by default, can be overridden per test, and every request is recorded.
 */

export interface RecordedRequest {
	method: string;
	path: string;
	query: Record<string, string>;
	headers: Headers;
	body: string;
}

type Handler = (request: Request, recorded: RecordedRequest) => Response | Promise<Response>;

export class FakeUpstream {
	readonly requests: RecordedRequest[] = [];
	private readonly handlers = new Map<string, Handler>();
	private readonly server: ReturnType<typeof Bun.serve>;

	constructor() {
		this.server = Bun.serve({
			port: 0,
			hostname: "127.0.0.1",
			fetch: async (request) => {
				const url = new URL(request.url);
				const recorded: RecordedRequest = {
					method: request.method,
					path: decodeURIComponent(url.pathname),
					query: Object.fromEntries(url.searchParams),
					headers: request.headers,
					body: request.method === "GET" ? "" : await request.clone().text(),
				};
				this.requests.push(recorded);
				const handler =
					this.handlers.get(`${request.method} ${url.pathname}`) ?? this.handlers.get(`${request.method} *`);
				if (!handler)
					return Response.json({ error: `no fake for ${request.method} ${url.pathname}` }, { status: 404 });
				return handler(request, recorded);
			},
		});
	}

	get url(): string {
		return `http://127.0.0.1:${this.server.port}`;
	}

	/** Registers a handler for `"METHOD /path"` (or `"METHOD *"` as a catch-all). */
	on(route: string, handler: Handler | unknown): this {
		this.handlers.set(
			route,
			typeof handler === "function" ? (handler as Handler) : () => Response.json(handler as object),
		);
		return this;
	}

	/** Serves a fixture file from `fixtures/<name>.json`. */
	fixture(route: string, name: string): this {
		return this.on(route, async () =>
			Response.json(await Bun.file(`${import.meta.dir}/../fixtures/${name}.json`).json()),
		);
	}

	last(method: string, path: string): RecordedRequest | undefined {
		return this.requests.findLast((r) => r.method === method && r.path === path);
	}

	stop(): Promise<void> {
		return this.server.stop(true);
	}
}
