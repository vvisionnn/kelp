/** Only allow in-app paths as post-login destinations. */
export function safeRedirect(target: string | undefined): string {
	return target?.startsWith("/") && !target.startsWith("//") ? target : "/";
}
