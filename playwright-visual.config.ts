import { defineConfig, devices } from "@playwright/test";

const PORT = 3101;
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Separate, smaller Playwright project for visual regression only, so it can
 * be run/updated independently of the golden-journey e2e suite (see
 * docs/TESTING.md "Visual regression approve-flow").
 */
export default defineConfig({
  testDir: "./tests/visual",
  outputDir: "./test-results-visual",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  timeout: 30000,
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
  use: {
    baseURL: BASE_URL,
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: `npm run build && PORT=${PORT} npm run start -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
  },
});
