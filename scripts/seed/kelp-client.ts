/** A small client for Kelp's own API, used by the seed script (and handy for scripting Kelp). */

export class KelpApiError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "KelpApiError";
	}
}

export class KelpClient {
	private cookie = "";

	constructor(private readonly baseUrl: string) {}

	async signIn(username: string, password: string): Promise<void> {
		const response = await fetch(`${this.baseUrl}/api/auth/login`, {
			method: "POST",
			headers: { "content-type": "application/json", "x-kelp-csrf": "1" },
			body: JSON.stringify({ username, password }),
		});
		if (!response.ok) throw new KelpApiError(response.status, `Sign-in failed (${response.status})`);
		this.cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
	}

	async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
		const response = await fetch(`${this.baseUrl}/api${path}`, {
			method,
			headers: {
				cookie: this.cookie,
				"x-kelp-csrf": "1",
				...(body === undefined ? {} : { "content-type": "application/json" }),
			},
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		});
		const text = await response.text();
		if (!response.ok) {
			let message = text;
			try {
				message = (JSON.parse(text) as { error?: string }).error ?? text;
			} catch {
				// plain-text error
			}
			throw new KelpApiError(response.status, `${method} ${path}: ${message}`);
		}
		return (text ? JSON.parse(text) : null) as T;
	}

	get<T = unknown>(path: string) {
		return this.request<T>("GET", path);
	}
	post<T = unknown>(path: string, body?: unknown) {
		return this.request<T>("POST", path, body);
	}
	put<T = unknown>(path: string, body?: unknown) {
		return this.request<T>("PUT", path, body);
	}

	/** Runs a create call, treating "already exists" (409) as success so seeding can be re-run. */
	async ensure<T>(create: () => Promise<T>): Promise<T | undefined> {
		try {
			return await create();
		} catch (error) {
			if (error instanceof KelpApiError && error.status === 409) return undefined;
			throw error;
		}
	}
}
