import { test, expect, type Page } from "@playwright/test";

/**
 * Visual regression: /styleguide + 5 key dashboards, each in light and dark
 * mode. Viewport coverage (desktop/mobile) comes from the two Playwright
 * projects declared in playwright-visual.config.ts, so this file only needs
 * to iterate pages x themes.
 *
 * Approve-flow: see docs/TESTING.md ("Visual regression approve-flow").
 */
const PAGES = [
  { path: "/styleguide", name: "styleguide" },
  { path: "/", name: "dashboard-home" },
  { path: "/capture", name: "dashboard-capture" },
  { path: "/findings", name: "dashboard-findings" },
  { path: "/decisions", name: "dashboard-decisions" },
  { path: "/approvals", name: "dashboard-approvals" },
];

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript((t) => {
    window.localStorage.setItem("leados.theme", t);
  }, theme);
}

for (const { path, name } of PAGES) {
  for (const theme of ["light", "dark"] as const) {
    test(`${name} — ${theme}`, async ({ page }) => {
      await setTheme(page, theme);
      await page.goto(path);
      if (theme === "dark") {
        await expect(page.locator("html")).toHaveClass(/dark/);
      }
      await page.waitForTimeout(100); // allow fonts/transition to settle
      await expect(page).toHaveScreenshot(`${name}-${theme}.png`, { fullPage: true });
    });
  }
}
