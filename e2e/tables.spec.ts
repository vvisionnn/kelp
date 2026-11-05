import { createSampleTables } from "../scripts/iceberg-sample.ts";
import { S3_CREDENTIALS, stackPorts } from "../scripts/stack-lib.ts";
import { expect, test, unique } from "./fixtures.ts";

// One worker owns the sample warehouse so setup never races itself.
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
	const ports = stackPorts(Number(process.env.KELP_E2E_OFFSET ?? 100));
	await createSampleTables({
		adminUrl: `http://127.0.0.1:${ports.admin}`,
		filerUrl: `http://127.0.0.1:${ports.filer}`,
		icebergUrl: `http://127.0.0.1:${ports.iceberg}`,
		credentials: S3_CREDENTIALS,
	});
});

test("browses an Iceberg table: schema, rows, and a past snapshot", async ({ page }) => {
	await page.goto("/tables");
	await page.getByRole("link", { name: /analytics/ }).click();
	await expect(page.getByRole("region", { name: "Namespace sales" })).toBeVisible();
	await page
		.getByRole("region", { name: "Namespace sales" })
		.getByRole("link", { name: /orders/ })
		.click();

	await expect(page.getByRole("heading", { name: "sales.orders" })).toBeVisible();
	await expect(page.getByText("placed_at")).toBeVisible();
	await expect(page.getByRole("region", { name: "Records", exact: true }).first()).toContainText("510");

	await page.getByRole("tab", { name: "Data" }).click();
	await expect(page.getByRole("list", { name: "Data files" }).getByRole("button")).toHaveCount(9);
	await expect(page.getByRole("columnheader", { name: "customer" })).toBeVisible();
	await expect(
		page
			.getByRole("cell")
			.filter({ hasText: /^(eu-west|us-east|ap-south)$/ })
			.first(),
	).toBeVisible();

	await page.getByRole("tab", { name: "Snapshots" }).click();
	await expect(page.getByText("current", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Browse this version" }).last().click();
	await expect(page.getByRole("combobox", { name: "Snapshot" })).toHaveText(/1000001/);
	await expect(page.getByRole("list", { name: "Data files" }).getByRole("button")).toHaveCount(3);
});

test("manages a table bucket end to end", async ({ page }) => {
	const bucket = unique("e2e");
	const namespace = unique("ns").replaceAll("-", "_");
	await page.goto("/tables");
	await page.getByRole("button", { name: "Create table bucket" }).click();
	await page.getByRole("dialog").getByLabel("Name").fill(bucket);
	await page.getByRole("dialog").getByRole("button", { name: "Create table bucket" }).click();
	await expect(page).toHaveURL(new RegExp(`/tables/${bucket}$`));
	await expect(page.getByText("No namespaces yet")).toBeVisible();

	await page.getByRole("button", { name: "Create namespace" }).click();
	await page.getByRole("dialog").getByLabel("Name").fill(namespace);
	await page.getByRole("dialog").getByRole("button", { name: "Create namespace" }).click();
	await expect(page.getByRole("region", { name: `Namespace ${namespace}` })).toBeVisible();

	await page.getByRole("button", { name: "Create table" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel("Name", { exact: true }).fill("events");
	await dialog.getByRole("button", { name: "Add column" }).click();
	await dialog.getByLabel("Column 2 name").fill("happened_at");
	await dialog.getByRole("combobox", { name: "Column 2 type" }).click();
	await page.getByRole("option", { name: "timestamptz" }).click();
	await dialog.getByText("Required").nth(1).click();
	await dialog.getByRole("button", { name: "Create table" }).click();
	await expect(page).toHaveURL(new RegExp(`/tables/${bucket}/${namespace}/events$`));
	await expect(page.getByText("happened_at")).toBeVisible();
	await expect(page.getByText("required")).toHaveCount(2);

	await page.getByRole("tab", { name: "Access" }).click();
	await page.getByRole("button", { name: "Deny deletes" }).click();
	await page.getByRole("button", { name: "Save policy" }).click();
	await expect(page.getByText("Table policy saved")).toBeVisible();
	await page.getByRole("button", { name: "Add tag" }).click();
	await page.getByLabel("Tag key").fill("owner");
	await page.getByLabel("Tag value").fill("e2e");
	await page.getByRole("button", { name: "Save tags" }).click();
	await expect(page.getByText("Tags saved")).toBeVisible();
	await page.reload();
	await expect(page.getByLabel("Tag key")).toHaveValue("owner");
	await expect(page.getByLabel("Policy JSON")).toContainText("s3tables:DeleteTable");

	await page.getByRole("button", { name: "Delete table" }).click();
	await page.getByRole("alertdialog").getByRole("textbox").fill("events");
	await page.getByRole("alertdialog").getByRole("button", { name: "Delete table" }).click();
	await expect(page).toHaveURL(new RegExp(`/tables/${bucket}$`));

	await page.getByRole("button", { name: `Delete namespace ${namespace}` }).click();
	await page.getByRole("alertdialog").getByRole("button", { name: "Delete namespace" }).click();
	await expect(page.getByText("No namespaces yet")).toBeVisible();

	await page.getByRole("button", { name: "Delete bucket" }).click();
	await page.getByRole("alertdialog").getByRole("textbox").fill(bucket);
	await page.getByRole("alertdialog").getByRole("button", { name: "Delete bucket" }).click();
	await expect(page).toHaveURL(/\/tables$/);
	await expect(page.getByRole("link", { name: new RegExp(bucket) })).toHaveCount(0);
});

test("viewers read tables without edit controls", async ({ viewerPage }) => {
	await viewerPage.goto("/tables/analytics/sales/orders?tab=access");
	await expect(viewerPage.getByText("owner=sales-ops").or(viewerPage.getByText("No tags."))).toBeVisible();
	await expect(viewerPage.getByRole("button", { name: "Delete table" })).toHaveCount(0);
	await expect(viewerPage.getByLabel("Policy JSON")).toHaveCount(0);
});
