import type { SessionUser } from "@shared/api.ts";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api.ts";

export const sessionQuery = queryOptions({
	queryKey: ["session"],
	queryFn: async () => (await api.get<{ user: SessionUser }>("/auth/me")).user,
	staleTime: 5 * 60_000,
	retry: false,
});

/** The signed-in user. Only use below the authenticated layout, where the session is guaranteed. */
export function useSession(): SessionUser {
	const { data } = useQuery(sessionQuery);
	return data ?? { name: "", role: "viewer" };
}

export function useCanWrite(): boolean {
	return useSession().role === "admin";
}

export function useSignIn() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (credentials: { username: string; password: string }) =>
			api.post<{ user: SessionUser }>("/auth/login", credentials),
		onSuccess: ({ user }) => queryClient.setQueryData(sessionQuery.queryKey, user),
	});
}

export function useSignOut() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => api.post("/auth/logout"),
		onSettled: () => queryClient.clear(),
	});
}
