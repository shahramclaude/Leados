// Visual regression: the styleguide + 5 key dashboards, in light and dark,
// at whatever viewport the current Playwright project runs (desktop/mobile
// — see playwright.config.ts projects). Baselines live under
// tests/e2e/visual.spec.ts-snapshots/ and are reviewed/approved per
// docs/TESTING.md "Visual regression approve-flow".
import { expect, test, type Page } from "@playwright/test";

const PAGES: { name: string; path: string }[] = [
  { name: "styleguide", path: "/styleguide" },
  { name: "home", path: "/" },
  { name: "findings", path: "/findings" },
  { name: "decisions", path: "/decisions" },
  { name: "automation", path: "/automation" },
  { name: "boardpack", path: "/boardpack" },
];

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript((t) => window.localStorage.setItem("ld-theme", t), theme);
}

for (const { name, path } of PAGES) {
  for (const theme of ["light", "dark"] as const) {
    test(`visual: ${name} (${theme})`, async ({ page }) => {
      await setTheme(page, theme);
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveScreenshot(`${name}-${theme}.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.02,
      });
    });
  }
}
