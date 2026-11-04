import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { mockApi, viewerUser } from "../../test/render-app.tsx";
import { useCanWrite, useSession } from "./session.ts";

function wrapper({ children }: { children: ReactNode }) {
	return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe("session hooks", () => {
	test("viewers cannot write; unknown sessions are read-only", async () => {
		const api = mockApi({ "GET /auth/me": { user: viewerUser } });
		const { result } = renderHook(() => ({ user: useSession(), canWrite: useCanWrite() }), { wrapper });
		expect(result.current).toEqual({ user: { name: "", role: "viewer" }, canWrite: false });
		await waitFor(() => expect(result.current.user).toEqual(viewerUser));
		expect(result.current.canWrite).toBe(false);
		api.restore();
	});
});
