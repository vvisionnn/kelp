import { type QueryKey, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export interface ActionOptions<TInput, TOutput> {
	run: (input: TInput) => Promise<TOutput>;
	/** Toast shown on success; named after the action ("Bucket created"). */
	success: string | ((output: TOutput, input: TInput) => string);
	/** Queries to refresh once the action succeeds. */
	invalidate?: QueryKey[];
	onSuccess?: (output: TOutput, input: TInput) => void;
}

/** A write to SeaweedFS with consistent feedback: success toast, error toast, and fresh data. */
export function useAction<TInput = void, TOutput = unknown>({
	run,
	success,
	invalidate = [],
	onSuccess,
}: ActionOptions<TInput, TOutput>) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: run,
		onSuccess: async (output, input) => {
			toast.success(typeof success === "function" ? success(output, input) : success);
			await Promise.all(invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
			onSuccess?.(output, input);
		},
		onError: (error) => {
			toast.error(error instanceof Error ? error.message : "Something went wrong");
		},
	});
}
