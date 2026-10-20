// Ten golden journeys through the LEADOS slice built for Part 11. These are
// scoped to what actually exists in this working tree (events → findings →
// decisions → automation → board pack), not the aspirational full feature
// set from later-part specs that isn't implemented here — see
// AI-SESSION-LOG.md for the provenance note.
import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("1. Home page shows live system status with a connected database", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("system-status")).toBeVisible();
  await expect(page.getByTestId("db-status")).toHaveText("connected");
});

test("2. Onboarding journey: complete onboarding and see the completed state persist", async ({ page }) => {
  await page.goto("/onboarding");
  await page.getByTestId("org-name-input").fill("Golden Journey Org");
  await page.getByTestId("complete-onboarding").click();
  await expect(page.getByTestId("onboarding-complete")).toContainText("Golden Journey Org");

  await page.reload();
  await expect(page.getByTestId("onboarding-complete")).toContainText("Golden Journey Org");
});

test("3. Capture journey: capture a signal and see it appear in the event log", async ({ page }) => {
  const title = `Signal ${Date.now()}`;
  await page.goto("/capture");
  await page.getByTestId("capture-title").fill(title);
  await page.getByTestId("capture-body").fill("Observed during the golden journey e2e run.");
  await page.getByTestId("capture-tags").fill("e2e, golden-journey");
  await page.getByTestId("submit-capture").click();

  await expect(page).toHaveURL(/\/events$/);
  await expect(page.getByTestId("events-list")).toContainText("signal.captured");
  await expect(page.getByTestId("events-list")).toContainText(title);
});

test("4. Finding journey: create a finding and see its computed ICE score", async ({ page }) => {
  const title = `Finding ${Date.now()}`;
  await page.goto("/findings");
  await page.getByTestId("finding-title").fill(title);
  await page.getByTestId("finding-impact").fill("10");
  await page.getByTestId("finding-confidence").fill("10");
  await page.getByTestId("finding-effort").fill("1");
  await page.getByTestId("submit-finding").click();

  await expect(page.getByTestId("findings-list")).toContainText(title);
  await expect(page.getByTestId("findings-list")).toContainText("score 100");
});

test("5. Decision journey: create a decision and update its belief via Bayesian evidence", async ({ page }) => {
  const title = `Decision ${Date.now()}`;
  await page.goto("/decisions");
  await page.getByTestId("decision-title").fill(title);
  await page.getByTestId("submit-decision").click();

  const row = page.getByTestId("decisions-list").locator("li").filter({ hasText: title });
  await expect(row).toContainText("belief 50.0%");

  await row.getByRole("button", { name: "Update belief" }).click();
  await expect(page.getByTestId("decisions-list").locator("li").filter({ hasText: title })).not.toContainText(
    "belief 50.0%",
  );
});

test("6. Automation journey: trigger a Monte Carlo forecast run and see its summary stats", async ({ page }) => {
  await page.goto("/automation");
  await page.getByTestId("automation-base").fill("2000");
  await page.getByTestId("run-automation").click();

  await expect(page.getByTestId("runs-list")).toContainText("monte_carlo_forecast");
  await expect(page.getByTestId("runs-list")).toContainText('"p50"');
});

test("7. Board pack journey: generate a board pack and export it as JSON", async ({ page }) => {
  await page.goto("/boardpack");
  await page.getByTestId("generate-boardpack").click();
  await expect(page.getByTestId("boardpack-summary")).toBeVisible();

  const [download] = await Promise.all([
    page.waitForResponse((res) => res.url().includes("/api/boardpack") && res.status() === 200),
    page.getByTestId("download-boardpack").click(),
  ]);
  const body = await download.json();
  expect(body.summary.totals).toBeDefined();
});

test("8. Self-test journey: the /about smoke subset reports all checks passing", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByTestId("self-test-overall")).toContainText("All smoke checks passing", {
    timeout: 30_000,
  });
  const results = page.getByTestId("self-test-results");
  await expect(results.getByText("✅")).toHaveCount(await results.locator("li").count());
});

test("9. Styleguide journey: toggle dark mode and see tokens repaint", async ({ page }) => {
  await page.goto("/styleguide");
  await expect(page.getByTestId("styleguide")).toBeVisible();
  const htmlTheme = () => page.evaluate(() => document.documentElement.dataset.theme);

  expect(await htmlTheme()).not.toBe("dark");
  await page.getByTestId("theme-toggle").click();
  await expect.poll(htmlTheme).toBe("dark");
  await page.getByTestId("theme-toggle").click();
  await expect.poll(htmlTheme).toBe("light");
});

test("10. Navigation journey: every nav link resolves to a working page", async ({ page }) => {
  await page.goto("/");
  const hrefs = ["/onboarding", "/capture", "/events", "/findings", "/decisions", "/automation", "/boardpack", "/styleguide", "/about"];
  for (const href of hrefs) {
    const response = await page.goto(href);
    expect(response?.status(), `${href} should respond 200`).toBe(200);
  }
});
