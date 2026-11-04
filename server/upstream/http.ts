export type UpstreamName = "admin" | "master" | "filer" | "grpc";

/** A failure talking to a SeaweedFS component, carrying the HTTP status Kelp should answer with. */
export class UpstreamError extends Error {
	constructor(
		readonly upstream: UpstreamName,
		readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "UpstreamError";
	}
}

export interface RequestOptions {
	method?: string;
	query?: Record<string, string | number | boolean | undefined>;
	body?: unknown;
	headers?: Record<string, string>;
	signal?: AbortSignal;
}

/** Thin fetch wrapper for one SeaweedFS HTTP endpoint with timeouts and uniform errors. */
export class HttpUpstream {
	private readonly timeoutMs: number;

	constructor(
		readonly name: UpstreamName,
		private readonly baseUrl: string,
		options: { timeoutMs?: number } = {},
	) {
		this.timeoutMs = options.timeoutMs ?? 15_000;
	}

	url(path: string, query?: RequestOptions["query"]): URL {
		const base = this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`;
		const url = new URL(path.replace(/^\/+/, ""), base);
		for (const [key, value] of Object.entries(query ?? {})) {
			if (value !== undefined) url.searchParams.set(key, String(value));
		}
		return url;
	}

	/** Performs a request and returns the response, throwing `UpstreamError` for non-2xx statuses. */
	async raw(path: string, options: RequestOptions & { rawBody?: BodyInit } = {}): Promise<Response> {
		const headers = new Headers(options.headers);
		let body: BodyInit | undefined = options.rawBody;
		if (options.body !== undefined) {
			headers.set("content-type", "application/json");
			body = JSON.stringify(options.body);
		}
		const timeout = AbortSignal.timeout(this.timeoutMs);
		const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
		let response: Response;
		try {
			response = await fetch(this.url(path, options.query), {
				method: options.method ?? "GET",
				headers,
				...(body === undefined ? {} : { body }),
				signal,
				// Request bodies may be streams (uploads).
				...(body instanceof ReadableStream ? { duplex: "half" } : {}),
			} as RequestInit);
		} catch (error) {
			if (timeout.aborted) throw new UpstreamError(this.name, 504, `${this.name} did not respond in time`);
			throw new UpstreamError(this.name, 502, `${this.name} is unreachable: ${(error as Error).message}`);
		}
		if (!response.ok) throw await this.toError(response);
		return response;
	}

	/** Performs a request and parses the JSON body; empty bodies resolve to `null`. */
	async json<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
		const response = await this.raw(path, options);
		const text = await response.text();
		return (text ? JSON.parse(text) : null) as T;
	}

	private async toError(response: Response): Promise<UpstreamError> {
		const text = (await response.text()).trim();
		let message = text;
		try {
			const parsed = JSON.parse(text) as { error?: string; message?: string };
			message = parsed.error || parsed.message || text;
		} catch {
			// plain-text body
		}
		return new UpstreamError(
			this.name,
			response.status,
			message || `${this.name} returned ${response.status}`,
		);
	}
}
