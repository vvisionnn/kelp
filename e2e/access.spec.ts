import { expect, test, unique } from "./fixtures.ts";

test("full access lifecycle: policy, user and key, group, service account", async ({ page }) => {
	const policy = unique("e2e-policy");
	const user = unique("e2e-user");
	const group = unique("e2e-group");

	// A policy from a template, checked by SeaweedFS as it is edited.
	await page.goto("/access/policies/new");
	await page.getByLabel("Name").fill(policy);
	await page.getByLabel("Bucket").fill("e2e-bucket");
	// Morphing text is also present as glyphs, so `first()` picks the readable copy.
	await expect(page.getByText("Policy document is valid").first()).toBeVisible();
	await page.getByRole("button", { name: "Create policy" }).click();
	await expect(page).toHaveURL(new RegExp(`/access/policies/${policy}$`));
	await expect(page.getByText("Not attached to anyone.")).toBeVisible();

	// A user with the policy and a generated key; the secret is shown once.
	await page.goto("/access/users");
	await page.getByRole("button", { name: "Create user" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel("Username").fill(user);
	await dialog.getByRole("button", { name: policy }).click();
	await dialog.getByRole("button", { name: "Create user" }).click();
	await expect(dialog.getByText("Copy the secret now")).toBeVisible();
	const secret = (await dialog.getByTestId("Secret key").textContent()) ?? "";
	expect(secret.length).toBeGreaterThanOrEqual(30);
	await dialog.getByRole("button", { name: "I saved the secret" }).click();
	await expect(page).toHaveURL(new RegExp(`/access/users/${user}$`));
	await expect(page.locator("body")).not.toContainText(secret);

	// Pause the key, then add a second one.
	const toggle = page.getByRole("switch", { name: /^Active: / });
	await toggle.click();
	await expect(page.getByText("Access key deactivated")).toBeVisible();
	await expect(page.getByText("Inactive", { exact: true }).first()).toBeVisible();
	await page.getByRole("button", { name: "Create access key" }).click();
	await page.getByRole("dialog").getByRole("button", { name: "Create access key" }).click();
	await expect(page.getByText("Copy the secret now")).toBeVisible();
	await page.getByRole("button", { name: "I saved the secret" }).click();
	await expect(page.getByRole("switch", { name: /^Active: / })).toHaveCount(2);

	// A group with the user and the policy.
	await page.goto("/access/groups");
	await page.getByRole("button", { name: "Create group" }).first().click();
	await page.getByRole("dialog").getByLabel("Name").fill(group);
	await page.getByRole("dialog").getByRole("button", { name: "Create group" }).click();
	await expect(page).toHaveURL(new RegExp(`/access/groups/${group}$`));
	await page.getByRole("combobox", { name: "Add member" }).click();
	await page.getByRole("option", { name: user }).click();
	await expect(page.getByText(`${user} added to ${group}`)).toBeVisible();
	await page.getByRole("combobox", { name: "Attach policy" }).click();
	await page.getByRole("option", { name: policy }).click();
	await expect(page.getByText(`Policy ${policy} attached`)).toBeVisible();

	// The policy now reports both uses and cannot be deleted.
	await page.goto(`/access/policies/${policy}`);
	await expect(page.getByText("Used by: 1 user, 1 group").first()).toBeVisible();
	await expect(page.getByText("Detach it from 2 places before deleting.")).toBeVisible();

	// A service account acting as the user.
	await page.goto("/access/service-accounts");
	await page.getByRole("button", { name: "Create service account" }).first().click();
	await page.getByRole("combobox", { name: "Acts as" }).click();
	await page.getByRole("option", { name: user }).click();
	await page.getByRole("dialog").getByLabel("Description").fill(`${user} backups`);
	await page.getByRole("dialog").getByRole("button", { name: "Create service account" }).click();
	await expect(page.getByText("Copy the secret now")).toBeVisible();
	await page.getByRole("button", { name: "I saved the secret" }).click();
	await page.getByText(`${user} backups`).click();
	const sheet = page.getByRole("dialog");
	await sheet.getByRole("switch").click();
	await expect(page.getByText("Service account updated")).toBeVisible();
	await sheet.getByRole("button", { name: "Delete service account" }).click();
	await page.getByRole("alertdialog").getByRole("button", { name: "Delete service account" }).click();
	await expect(page.getByText(`${user} backups`)).toHaveCount(0);

	// Clean up: group, user, then the now-unused policy.
	await page.goto(`/access/groups/${group}`);
	await expect(page.getByRole("button", { name: "Delete group" })).toHaveCount(0);
	await page.getByRole("button", { name: `Remove ${user}` }).click();
	await expect(page.getByText(`${user} removed from ${group}`)).toBeVisible();
	await page.getByRole("button", { name: `Remove ${policy}` }).click();
	await expect(page.getByText(`Policy ${policy} detached`)).toBeVisible();
	await page.getByRole("button", { name: "Delete group" }).click();
	await page.getByRole("alertdialog").getByRole("textbox").fill(group);
	await page.getByRole("alertdialog").getByRole("button", { name: "Delete group" }).click();
	await expect(page).toHaveURL(/\/access\/groups$/);

	await page.goto(`/access/users/${user}`);
	await page.getByRole("button", { name: "Delete user" }).click();
	await page.getByRole("alertdialog").getByRole("textbox").fill(user);
	await page.getByRole("alertdialog").getByRole("button", { name: "Delete user" }).click();
	await expect(page).toHaveURL(/\/access\/users$/);
	await expect(page.getByText(user)).toHaveCount(0);

	await page.goto(`/access/policies/${policy}`);
	await expect(page.getByText("Not attached to anyone.")).toBeVisible();
	await page.getByRole("button", { name: "Delete policy" }).click();
	await page.getByRole("alertdialog").getByRole("textbox").fill(policy);
	await page.getByRole("alertdialog").getByRole("button", { name: "Delete policy" }).click();
	await expect(page).toHaveURL(/\/access\/policies$/);
});

test("duplicate users get a clear message", async ({ page }) => {
	const user = unique("e2e-dupe");
	for (let attempt = 0; attempt < 2; attempt++) {
		await page.goto("/access/users");
		await page.getByRole("button", { name: "Create user" }).click();
		const dialog = page.getByRole("dialog");
		await dialog.getByLabel("Username").fill(user);
		await dialog.getByRole("switch").click();
		await dialog.getByRole("button", { name: "Create user" }).click();
		if (attempt === 0) await expect(page).toHaveURL(new RegExp(`/access/users/${user}$`));
	}
	await expect(page.getByText(`User ${user} already exists`)).toBeVisible();
});

test("viewers can read access settings but never see controls or secrets", async ({ viewerPage }) => {
	await viewerPage.goto("/access/users");
	const user = viewerPage.getByRole("link", { name: "kelp-dev", exact: true }).first();
	await expect(user).toBeVisible();
	await expect(viewerPage.getByRole("button", { name: "Create user" })).toHaveCount(0);
	await user.click();
	await expect(viewerPage.getByText(/defined in the S3 config file/)).toBeVisible();
	await expect(viewerPage.locator("body")).not.toContainText("kelp-dev-secret-key");
	const response = await viewerPage.request.get("/api/iam/users");
	expect(await response.text()).not.toContain("kelp-dev-secret-key");
});
