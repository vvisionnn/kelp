import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { UNAUTHORIZED_EVENT } from "@/lib/api.ts";
import "../../../test/objects-helpers.ts";
import { setMedia } from "../../../test/media.ts";
import { details, entry, objectsApi } from "../../../test/objects-fixtures.ts";
import { type ApiCall, renderApp, viewerUser } from "../../../test/render-app.tsx";
import { settle } from "../../../test/settle.ts";

/** Stands in for XMLHttpRequest uploads; each test decides how the server answers. */
class FakeXhr {
	static sent: FakeXhr[] = [];
	static respond: (xhr: FakeXhr) => void = (xhr) => xhr.finish(201, { path: "/x", size: 1 });
	method = "";
	url = "";
	headers: Record<string, string> = {};
	body: unknown;
	status = 0;
	responseText = "";
	upload: {
		onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;
	} = {
		onprogress: null,
	};
	onload: (() => void) | null = null;
	onerror: (() => void) | null = null;
	onabort: (() => void) | null = null;
	open(method: string, url: string) {
		this.method = method;
		this.url = url;
	}
	setRequestHeader(name: string, value: string) {
		this.headers[name] = value;
	}
	send(body: unknown) {
		this.body = body;
		FakeXhr.sent.push(this);
		queueMicrotask(() => FakeXhr.respond(this));
	}
	abort() {
		this.onabort?.();
	}
	finish(status: number, body: unknown) {
		this.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 2 });
		this.status = status;
		this.responseText = typeof body === "string" ? body : JSON.stringify(body);
		this.onload?.();
	}
}

const realXhr = globalThis.XMLHttpRequest;
beforeEach(() => {
	FakeXhr.sent = [];
	FakeXhr.respond = (xhr) => xhr.finish(201, { path: "/x", size: 1 });
	globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
});
afterEach(() => {
	globalThis.XMLHttpRequest = realXhr;
});

function file(name: string, type = "text/plain") {
	return new File(["hello"], name, { type });
}

describe("files page", () => {
	test("browses folders with breadcrumbs, and loads more on demand", async () => {
		const { routes } = await objectsApi();
		const app = renderApp("/files", routes);
		fireEvent.click(await screen.findByRole("button", { name: "projects" }));
		await waitFor(() => expect(app.router.state.location.search).toEqual({ path: "/projects" }));
		fireEvent.click(await screen.findByRole("button", { name: "kelp" }));
		expect(await screen.findByText("data.json")).toBeTruthy();
		await waitFor(() => expect(screen.getByText("notes.txt")).toBeTruthy());
		expect(
			app.api.calls
				.filter((c) => c.path === "/files/list")
				.at(-1)
				?.query.get("cursor"),
		).toBe("docs");
		expect(screen.getByText("expires")).toBeTruthy();

		const crumbs = screen.getByRole("navigation", { name: "Folder path" });
		expect(within(crumbs).getByText("kelp").closest("[aria-current]")?.getAttribute("aria-current")).toBe(
			"page",
		);
		fireEvent.click(within(crumbs).getByRole("button", { name: "All files" }));
		await waitFor(() => expect(app.router.state.location.search).toEqual({}));
	});

	test("moving between folders keeps the list until the next one answers", async () => {
		const { routes } = await objectsApi();
		let answer: (value: unknown) => void = () => {};
		const held = new Promise((resolve) => {
			answer = resolve;
		});
		const list = routes["GET /files/list"] as (call: ApiCall) => unknown;
		renderApp("/files", {
			...routes,
			"GET /files/list": async (call: ApiCall) => {
				if (call.query.get("path") === "/projects") await held;
				return list(call);
			},
		});
		const previous = await screen.findByRole("button", { name: "projects" });
		fireEvent.click(previous);
		const crumbs = screen.getByRole("navigation", { name: "Folder path" });
		await waitFor(() => expect(crumbs.textContent).toContain("projects"));
		expect(screen.getByRole("button", { name: "projects" })).toBe(previous);
		expect(screen.queryByRole("status", { name: "Loading folder" })).toBeNull();
		expect(previous.closest("[aria-busy]")).toBeTruthy();
		answer(null);
		expect(await screen.findByRole("button", { name: "kelp" })).toBeTruthy();
		await settle();
		expect(screen.queryByRole("button", { name: "projects" })).toBeNull();
	});

	test("the first load holds the folder's structure, and more rows stand ready at the end", async () => {
		const { routes } = await objectsApi();
		let answer: (value: unknown) => void = () => {};
		const held = new Promise((resolve) => {
			answer = resolve;
		});
		const list = routes["GET /files/list"] as (call: ApiCall) => unknown;
		renderApp("/files?path=/projects/kelp", {
			...routes,
			"GET /files/list": async (call: ApiCall) => {
				await held;
				if (call.query.get("cursor")) await new Promise(() => {});
				return list(call);
			},
		});
		expect(await screen.findByRole("status", { name: "Loading folder" })).toBeTruthy();
		expect(screen.getByRole("status", { name: "Loading folder summary" })).toBeTruthy();
		answer(null);
		expect(await screen.findByRole("status", { name: "Loading more" })).toBeTruthy();
		expect(await screen.findByText("data.json")).toBeTruthy();
	});

	test("the refresh button only turns for the person who pressed it", async () => {
		const { routes } = await objectsApi();
		renderApp("/files", routes);
		await screen.findByRole("button", { name: "projects" });
		const button = screen.getByRole("button", { name: "Refresh" });
		const icon = button.querySelector("svg") as SVGElement;
		expect(icon.getAttribute("class")).not.toContain("animate-spin");
		fireEvent.click(button);
		await waitFor(() => expect(icon.getAttribute("class")).toContain("animate-spin"));
		await waitFor(() => expect(icon.getAttribute("class")).not.toContain("animate-spin"));
	});

	test("filters the loaded folder and explains when nothing matches", async () => {
		const { routes } = await objectsApi();
		renderApp("/files?path=/buckets/media", routes);
		const filter = await screen.findByLabelText("Filter this folder");
		await screen.findByText("config.json");
		fireEvent.change(filter, { target: { value: "READ" } });
		expect(screen.queryByText("config.json")).toBeNull();
		expect(screen.getByText("README.md")).toBeTruthy();
		fireEvent.change(filter, { target: { value: "zzz" } });
		expect(screen.getByText("Nothing matches that filter")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
		expect(screen.getByText("config.json")).toBeTruthy();
	});

	test("missing folders show the filer's message and can be retried", async () => {
		const { routes } = await objectsApi();
		renderApp("/files?path=/nowhere", routes);
		expect(await screen.findByText("The folder /nowhere does not exist")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(await screen.findByText("The folder /nowhere does not exist")).toBeTruthy();
	});

	test("previews a text file with its properties and tags", async () => {
		const { routes } = await objectsApi();
		const fetches: Array<{ url: string; range: string | null }> = [];
		const app = renderApp("/files?path=/projects/kelp", {
			...routes,
			"GET /files/content": (call: ApiCall) => {
				fetches.push({ url: call.query.get("path") ?? "", range: null });
				return new Response("hello kelp");
			},
			"PUT /files/tags": (call: ApiCall) =>
				details("/projects/kelp/notes.txt", { tags: (call.body as { tags: Record<string, string> }).tags }),
		});
		fireEvent.click(await screen.findByRole("button", { name: "notes.txt" }));
		const sheet = await screen.findByRole("dialog");
		expect(await within(sheet).findByText("hello kelp")).toBeTruthy();
		expect(within(sheet).getByText("rw-rw----, owner 501, group 20")).toBeTruthy();
		expect(within(sheet).getByText("Never")).toBeTruthy();
		expect((within(sheet).getAllByLabelText("Tag key")[0] as HTMLInputElement).value).toBe("Team");

		fireEvent.click(within(sheet).getByRole("button", { name: "Add tag" }));
		const keys = within(sheet).getAllByLabelText("Tag key");
		fireEvent.change(keys[1] as HTMLElement, { target: { value: "bad key" } });
		expect(within(sheet).getByText("Keys use letters, numbers and hyphens.")).toBeTruthy();
		fireEvent.change(keys[1] as HTMLElement, { target: { value: "env" } });
		fireEvent.change(within(sheet).getAllByLabelText("Tag value")[1] as HTMLElement, {
			target: { value: "prod" },
		});
		fireEvent.click(within(sheet).getByRole("button", { name: "Remove tag Team" }));
		fireEvent.click(within(sheet).getByRole("button", { name: "Save tags" }));
		await waitFor(() =>
			expect(app.api.last("PUT", "/files/tags")?.body).toEqual({
				path: "/projects/kelp/notes.txt",
				tags: { env: "prod" },
			}),
		);
		expect(await screen.findByText("Tags saved")).toBeTruthy();
		expect(fetches[0]?.url).toBe("/projects/kelp/notes.txt");
	});

	test("previews by type: pretty JSON, images, media, PDFs and unknown files", async () => {
		const { routes } = await objectsApi();
		const kinds: Record<string, Partial<ReturnType<typeof details>>> = {
			"/buckets/media/config.json": { mime: "application/json", size: 20 },
			"/buckets/media/cat.png": { mime: "image/png" },
			"/buckets/media/clip.mp4": { mime: "video/mp4" },
			"/buckets/media/song.mp3": { mime: "audio/mpeg" },
			"/buckets/media/doc.pdf": { mime: "application/pdf" },
			"/buckets/media/blob.bin": {
				mime: "application/octet-stream",
				ttlSeconds: 7 * 86400,
				remote: true,
				attributes: { "X-Note": "hi" },
			},
		};
		renderApp("/files?path=/buckets/media", {
			...routes,
			"GET /files/list": {
				path: "/buckets/media",
				entries: Object.keys(kinds).map((path) => entry(path, kinds[path])),
				nextCursor: null,
			},
			"GET /files/entry": (call: ApiCall) =>
				details(call.query.get("path") ?? "", kinds[call.query.get("path") ?? ""]),
			"GET /files/content": () => new Response('{"a":1}'),
		});
		const open = async (name: string) => {
			fireEvent.click(await screen.findByRole("button", { name }));
			return screen.findByRole("dialog");
		};
		const close = async () => {
			fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
			await settle(300);
		};
		let sheet = await open("config.json");
		expect(await within(sheet).findByText(/"a": 1/)).toBeTruthy();
		expect(within(sheet).getByText("https://s3.example.com/media/config.json")).toBeTruthy();
		await close();
		sheet = await open("cat.png");
		expect(within(sheet).getByRole("img", { name: "cat.png" }).getAttribute("src")).toBe(
			"/api/files/content?path=%2Fbuckets%2Fmedia%2Fcat.png",
		);
		await close();
		sheet = await open("clip.mp4");
		expect(sheet.querySelector("video")).toBeTruthy();
		await close();
		sheet = await open("song.mp3");
		expect(sheet.querySelector("audio")).toBeTruthy();
		await close();
		sheet = await open("doc.pdf");
		expect(within(sheet).getByTitle("doc.pdf").tagName).toBe("IFRAME");
		await close();
		sheet = await open("blob.bin expires");
		expect(
			within(sheet).getByText("Kelp cannot preview this type of file. Download it to open it."),
		).toBeTruthy();
		expect(within(sheet).getByText("1 week")).toBeTruthy();
		expect(within(sheet).getByText("Remote (tiered)")).toBeTruthy();
		expect(within(sheet).getByText("hi")).toBeTruthy();
		expect(within(sheet).getByRole("link", { name: "Download" }).getAttribute("href")).toBe(
			"/api/files/content?path=%2Fbuckets%2Fmedia%2Fblob.bin&download=1",
		);
	});

	test("large text files show the first part only; failures are explained", async () => {
		const { routes } = await objectsApi();
		let ranges: string[] = [];
		const realFetch = globalThis.fetch;
		renderApp("/files?path=/buckets/media", {
			...routes,
			"GET /files/entry": (call: ApiCall) =>
				details(call.query.get("path") ?? "", {
					mime: "text/plain",
					size: call.query.get("path")?.includes("README") ? 10 ** 7 : 10,
				}),
			"GET /files/content": (call: ApiCall) =>
				call.query.get("path")?.includes("README")
					? new Response("# Big")
					: new Response("nope", { status: 500 }),
		});
		const apiFetch = globalThis.fetch;
		globalThis.fetch = ((input: string, init?: RequestInit) => {
			const range = new Headers(init?.headers).get("range");
			if (range) ranges.push(range);
			return apiFetch(input, init);
		}) as typeof fetch;
		fireEvent.click(await screen.findByRole("button", { name: "README.md" }));
		let sheet = await screen.findByRole("dialog");
		expect(await within(sheet).findByText("# Big")).toBeTruthy();
		expect(within(sheet).getByText("Showing the first 256 KiB of 9.54 MiB.")).toBeTruthy();
		expect(ranges).toEqual(["bytes=0-262143"]);
		fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
		await settle(300);
		ranges = [];
		fireEvent.click(screen.getByRole("button", { name: "config.json" }));
		sheet = await screen.findByRole("dialog");
		expect(await within(sheet).findByText("Could not load the file (500)")).toBeTruthy();
		globalThis.fetch = realFetch;
	});

	test("versioned objects list their versions with downloads, and S3 tags", async () => {
		const { routes } = await objectsApi();
		renderApp("/files?path=/buckets/media", {
			...routes,
			"GET /files/entry": (call: ApiCall) =>
				details(call.query.get("path") ?? "", {
					versionId: "bbb",
					s3Tags: { team: "design" },
					versions: [
						{
							versionId: "bbb",
							size: 85,
							modifiedAt: "2026-11-04T12:00:00.000Z",
							md5: null,
							isLatest: true,
							isDeleteMarker: false,
						},
						{
							versionId: "aaa",
							size: 77,
							modifiedAt: "2026-11-03T12:00:00.000Z",
							md5: null,
							isLatest: false,
							isDeleteMarker: false,
						},
						{
							versionId: "zzz",
							size: 0,
							modifiedAt: "2026-11-02T12:00:00.000Z",
							md5: null,
							isLatest: false,
							isDeleteMarker: true,
						},
					],
				}),
		});
		fireEvent.click(await screen.findByRole("button", { name: "README.md" }));
		const sheet = await screen.findByRole("dialog");
		const versions = within(await within(sheet).findByRole("region", { name: "Versions" }));
		expect(versions.getByText("Current")).toBeTruthy();
		expect(versions.getByText("Delete marker")).toBeTruthy();
		const older = versions.getByRole("link", { name: "Download version aaa" });
		expect(older.getAttribute("href")).toBe(
			"/api/files/content?path=%2Fbuckets%2Fmedia%2FREADME.md&download=1&versionId=aaa",
		);
		expect(versions.queryByRole("link", { name: "Download version zzz" })).toBeNull();
		const s3 = within(within(sheet).getByRole("region", { name: "S3 object tags" }));
		expect(s3.getByText("team")).toBeTruthy();
		expect(s3.getByText("design")).toBeTruthy();
	});

	test("a preview holds its stage, then the picture sharpens in, with motion on", async () => {
		setMedia("(prefers-reduced-motion: reduce)", false);
		const { routes } = await objectsApi();
		const path = "/buckets/media/cat.png";
		let answer: (value: unknown) => void = () => {};
		const held = new Promise((resolve) => {
			answer = resolve;
		});
		renderApp("/files?path=/buckets/media", {
			...routes,
			"GET /files/list": { path: "/buckets/media", entries: [entry(path)], nextCursor: null },
			"GET /files/entry": async () => {
				await held;
				return details(path, { mime: "image/png" });
			},
		});
		fireEvent.click(await screen.findByRole("button", { name: "cat.png" }));
		const sheet = await screen.findByRole("dialog");
		expect(await within(sheet).findByRole("status", { name: "Loading file" })).toBeTruthy();
		answer(null);
		const image = await within(sheet).findByRole("img", { name: "cat.png" });
		const stage = image.parentElement?.parentElement as HTMLElement;
		expect(stage.querySelectorAll('[data-slot="skeleton"]').length).toBe(1);
		fireEvent.load(image);
		await settle(100);
		expect(stage.querySelectorAll('[data-slot="skeleton"]').length).toBe(0);
		fireEvent.click(within(sheet).getByRole("button", { name: "Close" }));
		await settle(300);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	test("a missing file explains itself in the preview", async () => {
		const { routes } = await objectsApi();
		renderApp("/files?path=/buckets/media", {
			...routes,
			"GET /files/entry": () =>
				Response.json({ error: "/buckets/media/README.md does not exist" }, { status: 404 }),
		});
		fireEvent.click(await screen.findByRole("button", { name: "README.md" }));
		expect(await screen.findByText("/buckets/media/README.md does not exist")).toBeTruthy();
	});

	test("creates folders", async () => {
		const { routes } = await objectsApi();
		const app = renderApp("/files?path=/buckets/media", {
			...routes,
			"POST /files/folder": { path: "/buckets/media/raw" },
		});
		fireEvent.click(await screen.findByRole("button", { name: "New folder" }));
		const dialog = await screen.findByRole("dialog");
		const name = within(dialog).getByLabelText("Folder name");
		fireEvent.change(name, { target: { value: "a/b" } });
		expect(within(dialog).getByText("Names cannot contain /.")).toBeTruthy();
		fireEvent.change(name, { target: { value: "raw" } });
		fireEvent.click(within(dialog).getByRole("button", { name: "Create folder" }));
		expect(await screen.findByText("Folder raw created")).toBeTruthy();
		expect(app.api.last("POST", "/files/folder")?.body).toEqual({ parent: "/buckets/media", name: "raw" });
	});

	test("renames and moves from the row menu", async () => {
		const { routes } = await objectsApi();
		const app = renderApp("/files?path=/buckets/media", {
			...routes,
			"POST /files/move": (call: ApiCall) => ({ path: (call.body as { to: string }).to }),
		});
		fireEvent.click(await screen.findByRole("button", { name: "Actions for README.md" }));
		fireEvent.click(await screen.findByRole("menuitem", { name: "Move or rename" }));
		const dialog = await screen.findByRole("dialog");
		const target = within(dialog).getByLabelText("New path") as HTMLInputElement;
		expect(target.value).toBe("/buckets/media/README.md");
		const move = within(dialog).getByRole("button", { name: "Move" }) as HTMLButtonElement;
		expect(move.disabled).toBe(true);
		fireEvent.change(target, { target: { value: "/buckets/media/INTRO.md" } });
		fireEvent.click(move);
		expect(await screen.findByText("Renamed to INTRO.md")).toBeTruthy();
		await settle(300);

		fireEvent.click(screen.getByRole("button", { name: "Actions for config.json" }));
		fireEvent.click(await screen.findByRole("menuitem", { name: "Move or rename" }));
		const second = await screen.findByRole("dialog");
		fireEvent.change(within(second).getByLabelText("New path"), {
			target: { value: "/archive/config.json" },
		});
		fireEvent.click(within(second).getByRole("button", { name: "Move" }));
		expect(await screen.findByText("Moved to /archive")).toBeTruthy();
		expect(app.api.last("POST", "/files/move")?.body).toEqual({
			from: "/buckets/media/config.json",
			to: "/archive/config.json",
		});
	});

	test("deletes one item from its menu, and many with the selection bar", async () => {
		const { routes } = await objectsApi();
		const app = renderApp("/files?path=/buckets/media", {
			...routes,
			"POST /files/delete": (call: ApiCall) => {
				const paths = (call.body as { paths: string[] }).paths;
				return paths.length === 1
					? { deleted: paths, failed: [] }
					: { deleted: paths.slice(1), failed: [{ path: paths[0], error: "permission denied" }] };
			},
		});
		fireEvent.click(await screen.findByRole("button", { name: "Actions for photos" }));
		fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
		const dialog = await screen.findByRole("alertdialog");
		expect(
			within(dialog).getByText("The folder and everything inside it are deleted. This cannot be undone."),
		).toBeTruthy();
		fireEvent.click(within(dialog).getByRole("button", { name: "Delete folder" }));
		expect(await screen.findByText("photos deleted")).toBeTruthy();
		await settle(300);

		fireEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
		expect(screen.getByText("3 selected")).toBeTruthy();
		fireEvent.click(screen.getByRole("checkbox", { name: "Select photos" }));
		expect(screen.getByText("2 selected")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Delete" }));
		const bulk = await screen.findByRole("alertdialog");
		fireEvent.click(within(bulk).getByRole("button", { name: "Delete" }));
		expect(await screen.findByText("README.md deleted")).toBeTruthy();
		expect(await screen.findByText("/buckets/media/config.json: permission denied")).toBeTruthy();
		expect(app.api.last("POST", "/files/delete")?.body).toEqual({
			paths: ["/buckets/media/config.json", "/buckets/media/README.md"],
		});
	});

	test("a failed single delete keeps the dialog open", async () => {
		const { routes } = await objectsApi();
		renderApp("/files?path=/buckets/media", {
			...routes,
			"POST /files/delete": () => Response.json({ error: "filer is unreachable" }, { status: 502 }),
		});
		fireEvent.click(await screen.findByRole("button", { name: "Actions for README.md" }));
		fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
		const dialog = await screen.findByRole("alertdialog");
		fireEvent.click(within(dialog).getByRole("button", { name: "Delete file" }));
		expect(await screen.findByText("filer is unreachable")).toBeTruthy();
		expect(screen.getByRole("alertdialog")).toBeTruthy();
		fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
	});

	test("copies paths and S3 URLs", async () => {
		const { routes } = await objectsApi();
		const writeText = mock(async (_text: string) => {});
		Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
		renderApp("/files?path=/buckets/media", routes);
		fireEvent.click(await screen.findByRole("button", { name: "Actions for README.md" }));
		fireEvent.click(await screen.findByRole("menuitem", { name: "Copy S3 URL" }));
		expect(await screen.findByText("S3 URL copied")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Actions for README.md" }));
		fireEvent.click(await screen.findByRole("menuitem", { name: "Copy path" }));
		expect(await screen.findByText("Path copied")).toBeTruthy();
		expect(writeText.mock.calls).toEqual([
			["https://s3.example.com/media/README.md"],
			["/buckets/media/README.md"],
		]);
	});

	test("uploads picked files with progress, then refreshes the folder", async () => {
		const { routes } = await objectsApi();
		const app = renderApp("/files?path=/buckets/media", routes);
		await screen.findByText("config.json");
		FakeXhr.respond = (xhr) => {
			if (xhr.url.includes("bad.txt"))
				xhr.finish(507, { error: "Bucket is over its quota", upstream: "filer" });
			else xhr.finish(201, { path: "/buckets/media/a.txt", size: 5 });
		};
		const lists = app.api.calls.filter((c) => c.path === "/files/list").length;
		const input = screen.getByTestId("upload-input");
		await act(async () => {
			fireEvent.change(input, { target: { files: [file("a.txt"), file("bad.txt", "")] } });
		});
		const tray = await screen.findByRole("region", { name: "Uploads" });
		await waitFor(() => expect(within(tray).getByText("1 of 2 uploaded")).toBeTruthy());
		expect(within(tray).getByText("Bucket is over its quota")).toBeTruthy();
		expect(await screen.findByText("bad.txt was not uploaded: Bucket is over its quota")).toBeTruthy();
		expect(FakeXhr.sent[0]?.url).toBe("/api/files/upload?path=%2Fbuckets%2Fmedia&name=a.txt");
		expect(FakeXhr.sent[0]?.headers).toEqual({ "x-kelp-csrf": "1", "content-type": "text/plain" });
		expect(FakeXhr.sent[1]?.headers["content-type"]).toBe("application/octet-stream");
		await waitFor(() =>
			expect(app.api.calls.filter((c) => c.path === "/files/list").length).toBeGreaterThan(lists),
		);
		fireEvent.click(within(tray).getByRole("button", { name: "Close uploads" }));
		await settle(300);
		expect(screen.queryByRole("region", { name: "Uploads" })).toBeNull();
	});

	test("dropping files uploads them into the open folder", async () => {
		const { routes } = await objectsApi();
		renderApp("/files?path=/buckets/media", routes);
		const list = (await screen.findByTestId("file-list")).parentElement as HTMLElement;
		fireEvent.dragOver(list, { dataTransfer: { files: [] } });
		expect(await screen.findByText(/Drop to upload to/)).toBeTruthy();
		fireEvent.dragLeave(list, { relatedTarget: document.body });
		await settle(300);
		expect(screen.queryByText(/Drop to upload to/)).toBeNull();
		await act(async () => {
			fireEvent.drop(list, { dataTransfer: { files: [file("dropped.txt")] } });
		});
		expect(await screen.findByText("dropped.txt")).toBeTruthy();
		expect(FakeXhr.sent[0]?.url).toContain("name=dropped.txt");
	});

	test("upload transport failures and expired sessions are reported", async () => {
		const { routes } = await objectsApi();
		renderApp("/files?path=/buckets/media", routes);
		await screen.findByText("config.json");
		const expired = mock(() => {});
		window.addEventListener(UNAUTHORIZED_EVENT, expired);
		FakeXhr.respond = (xhr) => {
			if (xhr.url.includes("net.txt")) xhr.onerror?.();
			else if (xhr.url.includes("stop.txt")) xhr.abort();
			else xhr.finish(401, "not json");
		};
		await act(async () => {
			fireEvent.change(screen.getByTestId("upload-input"), {
				target: { files: [file("net.txt"), file("stop.txt"), file("late.txt")] },
			});
		});
		expect(await screen.findByText("net.txt was not uploaded: Kelp server is unreachable")).toBeTruthy();
		expect(await screen.findByText("stop.txt was not uploaded: Upload cancelled")).toBeTruthy();
		expect(await screen.findByText("late.txt was not uploaded: Upload failed (401)")).toBeTruthy();
		expect(expired).toHaveBeenCalled();
		window.removeEventListener(UNAUTHORIZED_EVENT, expired);
	});

	test("viewers browse and preview without write controls", async () => {
		const { routes } = await objectsApi();
		renderApp("/files?path=/buckets/media", routes, viewerUser);
		expect(await screen.findByText("config.json")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Upload" })).toBeNull();
		expect(screen.queryByRole("checkbox", { name: "Select all" })).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Actions for photos" }));
		expect(await screen.findByRole("menuitem", { name: "Open" })).toBeTruthy();
		expect(screen.queryByRole("menuitem", { name: "Delete" })).toBeNull();
	});

	test("refreshes on demand; dismissed dialogs do nothing", async () => {
		const { routes } = await objectsApi();
		const app = renderApp("/files?path=/buckets/media", routes);
		await screen.findByText("config.json");
		const lists = app.api.calls.filter((c) => c.path === "/files/list").length;
		fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
		await waitFor(() => expect(app.api.calls.filter((c) => c.path === "/files/list").length).toBe(lists + 1));
		fireEvent.click(screen.getByRole("button", { name: "Actions for README.md" }));
		fireEvent.click(await screen.findByRole("menuitem", { name: "Move or rename" }));
		fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Close" }));
		await settle(300);
		fireEvent.click(screen.getByRole("button", { name: "Actions for README.md" }));
		fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
		fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
		await settle(300);
		expect(screen.queryByRole("alertdialog")).toBeNull();
		expect(app.api.last("POST", "/files/delete")).toBeUndefined();
	});

	test("viewers see an empty folder without an upload hint", async () => {
		const { routes } = await objectsApi();
		renderApp("/files?path=/buckets/archive", routes, viewerUser);
		expect(await screen.findByText("Files will appear here once someone adds them.")).toBeTruthy();
	});

	test("empty folders invite uploads for admins only", async () => {
		const { routes } = await objectsApi();
		renderApp("/files?path=/buckets/archive", routes);
		expect(await screen.findByText("Drop files here, or use Upload.")).toBeTruthy();
	});
});
