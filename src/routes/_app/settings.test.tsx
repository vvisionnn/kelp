import { describe, expect, test } from "bun:test";
import { fireEvent, screen } from "@testing-library/react";
import { maintenanceApi } from "../../../test/maintenance-fixtures.ts";
import { renderApp, viewerUser } from "../../../test/render-app.tsx";

describe("settings page", () => {
	test("theme cards change the theme", async () => {
		const { routes } = await maintenanceApi();
		renderApp("/settings", routes);
		const dark = await screen.findByRole("radio", { name: "Abyss" });
		fireEvent.click(dark);
		expect(localStorage.getItem("kelp-theme")).toBe("dark");
		expect(document.documentElement.classList.contains("dark")).toBe(true);
		fireEvent.click(screen.getByRole("radio", { name: "Tidepool" }));
		expect(localStorage.getItem("kelp-theme")).toBe("light");
	});

	test("shows cluster and Kelp configuration without secrets", async () => {
		const { routes } = await maintenanceApi();
		renderApp("/settings", routes, viewerUser);
		expect(await screen.findByText("On and running")).toBeTruthy();
		expect(screen.getByText("127.0.0.1:9333")).toBeTruthy();
		expect(screen.getByText("(filer 30s)")).toBeTruthy();
		expect(screen.getAllByText("Not set").length).toBe(1);
		expect(await screen.findByText("http://seaweedfs-admin:23646")).toBeTruthy();
		expect(screen.getByText("https://s3.example.com")).toBeTruthy();
		expect(screen.getByText("12 hours")).toBeTruthy();
		expect(screen.getByText("Not configured")).toBeTruthy();
		expect(screen.getByText("(read-only)")).toBeTruthy();
		expect(screen.getByText("v1.2.3")).toBeTruthy();
		expect(screen.getByRole("link", { name: /Source and releases/ }).getAttribute("href")).toBe(
			"https://github.com/vvisionnn/kelp",
		);
	});

	test("other cluster states and missing values", async () => {
		const { routes, systemConfig, kelpSettings } = await maintenanceApi();
		renderApp("/settings", {
			...routes,
			"GET /system/config": {
				...systemConfig,
				maintenanceRunning: false,
				dataDir: "",
				cacheExpiration: "",
				filerCacheExpiration: "",
				s3PublicEndpoint: "https://public.example.com",
			},
			"GET /system/kelp": { ...kelpSettings, s3Endpoint: null, sessionTtlHours: 1, viewerEnabled: true },
		});
		expect(await screen.findByText("On, but not running")).toBeTruthy();
		expect(screen.getByText("https://public.example.com")).toBeTruthy();
		expect(await screen.findByText("1 hour")).toBeTruthy();
		expect(screen.getByText("Enabled")).toBeTruthy();
		expect(screen.getAllByText("Not set").length).toBe(3);
		expect(screen.getByText("(administrator)")).toBeTruthy();
	});

	test("maintenance off, and errors", async () => {
		const { routes, systemConfig } = await maintenanceApi();
		renderApp("/settings", {
			...routes,
			"GET /system/config": { ...systemConfig, maintenanceEnabled: false },
			"GET /system/kelp": () => Response.json({ error: "Kelp is restarting" }, { status: 503 }),
		});
		expect(await screen.findByText("Off")).toBeTruthy();
		expect(await screen.findByText("Kelp is restarting")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
	});

	test("cluster errors offer a retry", async () => {
		const { routes } = await maintenanceApi();
		renderApp("/settings", {
			...routes,
			"GET /system/config": () =>
				Response.json({ error: "admin is unreachable", upstream: "admin" }, { status: 502 }),
		});
		expect(await screen.findByText("SeaweedFS admin reported a problem")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
	});
});
