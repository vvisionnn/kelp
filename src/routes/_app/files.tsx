import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { FileBrowser } from "@/components/kelp/objects/file-browser.tsx";
import { PageHeader } from "@/components/kelp/page.tsx";
import { objectQueries } from "@/lib/objects-queries.ts";

export const Route = createFileRoute("/_app/files")({
	staticData: { section: "Object store", title: "Files" },
	validateSearch: z.object({ path: z.string().optional() }),
	loaderDeps: ({ search }) => ({ path: search.path ?? "/" }),
	loader: ({ context, deps }) =>
		void context.queryClient.prefetchInfiniteQuery(objectQueries.folder(deps.path)),
	component: FilesPage,
});

function FilesPage() {
	const { path = "/" } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	return (
		<>
			<PageHeader
				title="Files"
				description="Everything the filer stores, including bucket objects, as folders and files."
			/>
			<FileBrowser
				root="/"
				rootLabel="All files"
				path={path.startsWith("/") ? path : "/"}
				onNavigate={(next) => navigate({ search: next === "/" ? {} : { path: next } })}
			/>
		</>
	);
}
