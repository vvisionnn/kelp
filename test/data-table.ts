import { screen } from "@testing-library/react";

/**
 * The page's data table (the DataTable grid), as opposed to other tables on the page such as an
 * access matrix. Waits for nothing; call after the page has rendered.
 */
export function dataTable(): HTMLElement {
	const table = document.querySelector<HTMLElement>('[data-slot="data-grid"] table');
	if (!table) throw new Error(`no data table on the page:\n${screen.getByRole("main").textContent}`);
	return table;
}
