import { describe, expect, test } from "bun:test";
import type { Bucket } from "@shared/objects.ts";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { contentUrl, joinPath, parentPath, s3Url } from "@/lib/objects-queries.ts";
import { bucketNameProblem, quotaBytes, quotaFromBytes, quotaIsValid } from "./bucket-fields.tsx";
import { BucketFlags } from "./bucket-flags.tsx";
import { crumbsFor, sortEntries } from "./file-browser.tsx";
import { formatText, formatTtl, permissionString, previewKind } from "./file-preview.tsx";
import { describeActions, describeScope, emptyRule, ruleProblem, splitSize } from "./lifecycle-editor.tsx";
import { parsePolicy, policyTemplates } from "./policy-editor.tsx";

const bucket: Bucket = {
	name: "b",
	createdAt: null,
	modifiedAt: null,
	logicalSize: 0,
	physicalSize: 0,
	storedFiles: null,
	volumes: 0,
	quota: { enabled: false, bytes: 0 },
	readOnly: true,
	owner: "",
	versioning: "Suspended",
	objectLock: { enabled: true, mode: "COMPLIANCE", retentionDays: null },
	lifecycle: { rules: 2, enabled: 1 },
	policyStatements: 1,
};

describe("bucket helpers", () => {
	test("bucket names follow S3 rules", () => {
		expect(bucketNameProblem("ok-name")).toBeNull();
		expect(bucketNameProblem("Upper")).toBe("Use lowercase letters, numbers, dots and hyphens");
		expect(bucketNameProblem("-dash")).toBe("Start and end with a letter or number");
		expect(bucketNameProblem("a..b")).toBe("Avoid two dots in a row");
		expect(bucketNameProblem("10.0.0.1")).toBe("Bucket names cannot look like an IP address");
	});

	test("quotas split into the largest whole unit", () => {
		expect(quotaFromBytes(0)).toEqual({ enabled: false, size: 10, unit: "GiB" });
		expect(quotaFromBytes(2 * 1024 ** 4)).toEqual({ enabled: true, size: 2, unit: "TiB" });
		expect(quotaFromBytes(1536 * 1024 ** 2)).toEqual({ enabled: true, size: 1536, unit: "MiB" });
		expect(quotaFromBytes(1000)).toEqual({ enabled: true, size: 1, unit: "MiB" });
		expect(quotaBytes({ enabled: true, size: 1.5, unit: "GiB" })).toBe(1.5 * 1024 ** 3);
		expect(quotaIsValid({ enabled: true, size: Number.NaN, unit: "GiB" })).toBe(false);
		expect(quotaIsValid({ enabled: false, size: 0, unit: "GiB" })).toBe(true);
	});

	test("flags describe unusual bucket states", () => {
		render(
			<TooltipProvider>
				<BucketFlags bucket={bucket} />
				<BucketFlags
					bucket={{
						...bucket,
						readOnly: false,
						versioning: "Off",
						objectLock: { enabled: true, mode: "GOVERNANCE", retentionDays: 5 },
						lifecycle: { rules: 0, enabled: 0 },
						policyStatements: 2,
					}}
				/>
			</TooltipProvider>,
		);
		for (const label of ["Read-only", "Versioning paused", "Compliance lock", "Object lock", "Lifecycle"]) {
			expect(screen.getByText(label)).toBeTruthy();
		}
		expect(screen.getAllByText("Policy").length).toBe(2);
	});
});

describe("file helpers", () => {
	test("paths, URLs and S3 links", () => {
		expect(joinPath("/", "a")).toBe("/a");
		expect(joinPath("/a", "b")).toBe("/a/b");
		expect(parentPath("/a")).toBe("/");
		expect(parentPath("/a/b")).toBe("/a");
		expect(contentUrl("/a b", true)).toBe("/api/files/content?path=%2Fa+b&download=1");
		expect(s3Url("https://s3.example.com/", "/buckets/media/a b/c.txt")).toBe(
			"https://s3.example.com/media/a%20b/c.txt",
		);
		expect(s3Url(null, "/buckets/media/a")).toBeNull();
		expect(s3Url("https://s3", "/projects/a")).toBeNull();
	});

	test("folders sort first, names naturally", () => {
		const e = (name: string, isDirectory = false) =>
			({ name, isDirectory }) as Parameters<typeof sortEntries>[0][number];
		expect(sortEntries([e("file10"), e("b", true), e("file2"), e("a", true)]).map((x) => x.name)).toEqual([
			"a",
			"b",
			"file2",
			"file10",
		]);
	});

	test("breadcrumbs start at the browser's root", () => {
		expect(crumbsFor("/", "/", "All files")).toEqual([{ label: "All files", path: "/" }]);
		expect(crumbsFor("/", "/a/b", "All files").map((c) => c.path)).toEqual(["/", "/a", "/a/b"]);
		expect(crumbsFor("/buckets/m", "/buckets/m/x", "m")).toEqual([
			{ label: "m", path: "/buckets/m" },
			{ label: "x", path: "/buckets/m/x" },
		]);
	});

	test("preview kinds come from the MIME type, then the name", () => {
		const kind = (name: string, mime = "", isDirectory = false) => previewKind({ name, mime, isDirectory });
		expect(kind("dir", "", true)).toBe("none");
		expect(kind("a.png")).toBe("image");
		expect(kind("a.webm")).toBe("video");
		expect(kind("a.flac")).toBe("audio");
		expect(kind("a.pdf")).toBe("pdf");
		expect(kind("notes.md")).toBe("text");
		expect(kind("data", "application/x-yaml")).toBe("text");
		expect(kind("blob")).toBe("none");
	});

	test("formatting for previews and properties", () => {
		expect(formatText('{"a":1}', "x.json", true)).toBe('{\n  "a": 1\n}');
		expect(formatText("{broken", "x.json", true)).toBe("{broken");
		expect(formatText('{"a":1}', "x.json", false)).toBe('{"a":1}');
		expect(formatTtl(0)).toBe("Never");
		expect(formatTtl(3600)).toBe("1 hour");
		expect(formatTtl(90)).toBe("90 seconds");
		expect(formatTtl(365 * 86400 * 2)).toBe("2 years");
		expect(permissionString(0o754)).toBe("rwxr-xr--");
	});
});

describe("lifecycle helpers", () => {
	test("describes scope and actions", () => {
		const rule = { ...emptyRule(), expirationDays: null, sizeLessThan: 1024, expiredDeleteMarkers: true };
		expect(describeScope(rule)).toBe("All objects, smaller than 1 KiB");
		expect(describeActions(rule)).toEqual(["Remove delete markers with no versions left"]);
		expect(describeActions({ ...rule, expiredDeleteMarkers: false, newerNoncurrentVersions: 1 })).toEqual([
			"Always keep the newest 1 old version",
		]);
	});

	test("finds the first problem", () => {
		expect(ruleProblem({ ...emptyRule(), id: "x".repeat(256) }, [])).toBe(
			"Keep the rule name under 255 characters.",
		);
		expect(ruleProblem(emptyRule(), [])).toBeNull();
		expect(ruleProblem({ ...emptyRule(), expirationDate: "2027-01-01" }, [])).toBe(
			"Expire after a number of days or on a date, not both.",
		);
	});

	test("sizes split into a readable unit", () => {
		expect(splitSize(null)).toEqual({ value: "", unit: "MiB" });
		expect(splitSize(1500)).toEqual({ value: "1500", unit: "B" });
		expect(splitSize(3 * 1024 ** 3)).toEqual({ value: "3", unit: "GiB" });
	});
});

describe("policy helpers", () => {
	test("templates target the bucket and parse cleanly", () => {
		for (const template of policyTemplates("media")) {
			expect(JSON.stringify(template.policy)).toContain("arn:aws:s3:::media");
			expect(parsePolicy(JSON.stringify(template.policy))).toEqual({ policy: template.policy });
		}
	});

	test("a single statement object is accepted", () => {
		expect("policy" in parsePolicy('{"Statement": {"Effect": "Allow"}}')).toBe(true);
		expect(parsePolicy("null")).toEqual({ problem: "A policy is a JSON object." });
	});
});
