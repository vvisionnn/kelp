import type { ApiErrorBody } from "@shared/api.ts";

/** Dispatched on `window` whenever the server says the session is gone. */
export const UNAUTHORIZED_EVENT = "kelp:unauthorized";

export class ApiError extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly upstream?: string,
	) {
		super(message);
		this.name = "ApiError";
	}
}

type Query = Record<string, string | number | boolean | undefined | null>;

function url(path: string, query?: Query): string {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query ?? {})) {
		if (value !== undefined && value !== null) params.set(key, String(value));
	}
	const search = params.toString();
	return `/api${path}${search ? `?${search}` : ""}`;
}

async function request<T>(
	method: string,
	path: string,
	options: { query?: Query; body?: unknown } = {},
): Promise<T> {
	const headers: Record<string, string> = { "x-kelp-csrf": "1", accept: "application/json" };
	if (options.body !== undefined) headers["content-type"] = "application/json";
	let response: Response;
	try {
		response = await fetch(url(path, options.query), {
			method,
			headers,
			credentials: "same-origin",
			...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
		});
	} catch {
		throw new ApiError(0, "Kelp server is unreachable");
	}
	const text = await response.text();
	if (!response.ok) {
		// A 401 from /auth/* answers "who am I?"; anywhere else it means the session expired.
		if (response.status === 401 && !path.startsWith("/auth/"))
			window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
		let body: Partial<ApiErrorBody> = {};
		try {
			body = JSON.parse(text);
		} catch {
			// not JSON
		}
		throw new ApiError(response.status, body.error || `Request failed (${response.status})`, body.upstream);
	}
	return (text ? JSON.parse(text) : null) as T;
}

export const api = {
	get: <T>(path: string, query?: Query) => request<T>("GET", path, query ? { query } : {}),
	post: <T>(path: string, body?: unknown) => request<T>("POST", path, { body }),
	put: <T>(path: string, body?: unknown) => request<T>("PUT", path, { body }),
	delete: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body === undefined ? {} : { body }),
};
