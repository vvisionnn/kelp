/** Minimal SigV4-signed S3 PUT for end-to-end tests (Playwright runs on Node, without Bun's S3 client). */
import { createHash, createHmac } from "node:crypto";

const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();

export async function s3Put(
	endpoint: string,
	credentials: { accessKey: string; secretKey: string },
	bucket: string,
	key: string,
	body: string,
	contentType = "application/octet-stream",
): Promise<void> {
	const url = new URL(`/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`, endpoint);
	const now = new Date().toISOString().replace(/[-:]|\.\d{3}/g, "");
	const day = now.slice(0, 8);
	const region = "us-east-1";
	const payloadHash = sha256(body);
	const headers: Record<string, string> = {
		"content-type": contentType,
		host: url.host,
		"x-amz-content-sha256": payloadHash,
		"x-amz-date": now,
	};
	const signedHeaders = Object.keys(headers).sort().join(";");
	const canonicalHeaders = Object.keys(headers)
		.sort()
		.map((name) => `${name}:${headers[name]}\n`)
		.join("");
	const canonical = ["PUT", url.pathname, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
	const scope = `${day}/${region}/s3/aws4_request`;
	const toSign = ["AWS4-HMAC-SHA256", now, scope, sha256(canonical)].join("\n");
	const signingKey = hmac(
		hmac(hmac(hmac(`AWS4${credentials.secretKey}`, day), region), "s3"),
		"aws4_request",
	);
	const signature = createHmac("sha256", signingKey).update(toSign).digest("hex");
	const response = await fetch(url, {
		method: "PUT",
		body,
		headers: {
			...headers,
			authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
		},
	});
	if (!response.ok) throw new Error(`S3 PUT ${key} failed: ${response.status} ${await response.text()}`);
}
