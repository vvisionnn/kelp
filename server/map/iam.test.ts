import { describe, expect, test } from "bun:test";
import {
	cleanIamError,
	keyStatus,
	mapGroup,
	mapPolicy,
	mapServiceAccount,
	mapUserSummary,
	newSecret,
} from "./iam.ts";

describe("iam mappers", () => {
	test("empty key status means active", () => {
		expect(keyStatus("")).toBe("Active");
		expect(keyStatus("Inactive")).toBe("Inactive");
	});

	test("list users without a key have no keys", () => {
		expect(mapUserSummary({ username: "x", access_key: "" }).accessKeys).toEqual([]);
	});

	test("secrets need both halves", () => {
		expect(newSecret("AK", "")).toBeNull();
		expect(newSecret("AK", "SK")).toEqual({ accessKey: "AK", secretKey: "SK" });
	});

	test("groups default to enabled; service accounts without expiry", () => {
		expect(mapGroup({ name: "g" }).enabled).toBe(true);
		expect(mapServiceAccount({ id: "sa", expiration: "0001-01-01T00:00:00Z" }).expiresAt).toBeNull();
	});

	test("policies tolerate missing documents", () => {
		expect(mapPolicy({ name: "p" })).toMatchObject({
			document: { Version: "", Statement: [] },
			statementCount: 0,
			attachedTo: { users: [], groups: [] },
		});
	});

	test("cleans layered admin errors", () => {
		expect(cleanIamError("Failed to update user: failed to update user: boom")).toBe("Boom");
		expect(cleanIamError("rpc error: code = NotFound desc = user x not found")).toBe("User x not found");
		expect(
			cleanIamError(
				"Failed to delete policy: policy p is still attached to: group:g: policy is still attached",
			),
		).toBe("Policy p is still attached to group g. Detach it first.");
		expect(cleanIamError("Policy with this name already exists")).toBe(
			"Policy with this name already exists",
		);
	});
});
