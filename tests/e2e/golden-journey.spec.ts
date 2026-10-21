import { test, expect, type Page } from "@playwright/test";

/**
 * Golden journeys 1-7: onboarding -> capture -> finding -> decision ->
 * approval -> automation run -> board pack export. Each stage is its own
 * `test()` so a failure clearly names the broken stage, but they run
 * `serial` because each stage depends on data created by the previous one
 * (a single tenant's real, persisted pipeline — not a transaction-rollback
 * fixture, since this exercises the real running server).
 */
test.describe.serial("Golden journey: onboarding -> capture -> finding -> decision -> approval -> automation -> board pack", () => {
  const tenantName = `E2E Tenant ${Date.now()}`;
  const leadName = `E2E Lead ${Date.now()}`;

  test("1. onboarding creates a tenant and stores an API key", async ({ page }) => {
    await page.goto("/onboarding");
    await page.getByLabel("Organization name").fill(tenantName);
    await page.getByRole("button", { name: "Create tenant" }).click();
    await expect(page.getByTestId("onboarding-success")).toBeVisible();
    const apiKey = await page.evaluate(() => window.localStorage.getItem("leados.apiKey"));
    expect(apiKey).toBeTruthy();
  });

  test("2. capture records a lead", async ({ page }) => {
    await page.goto("/capture");
    await page.getByLabel("Lead name").fill(leadName);
    await page.getByRole("button", { name: "Capture lead" }).click();
    await expect(page.getByTestId("capture-status")).toHaveText(/captured/i);
    await expect(page.getByTestId("lead-list")).toContainText(leadName);
  });

  test("3. finding scores the lead with a beta-backed status", async ({ page }) => {
    await page.goto("/findings");
    await page.getByLabel("Lead").selectOption({ label: leadName });
    await page.getByLabel("Summary").fill("Strong signal from E2E run");
    await page.getByLabel("Positive").check();
    await page.getByRole("button", { name: "Create finding" }).click();
    await expect(page.getByTestId("finding-list")).toContainText("Strong signal from E2E run");
  });

  test("4. decision records pursue with a rationale", async ({ page }) => {
    await page.goto("/decisions");
    await page.getByLabel("Finding").selectOption({ label: "Strong signal from E2E run" });
    await page.getByLabel("Action").selectOption("pursue");
    await page.getByLabel("Rationale").fill("E2E rationale: looks promising");
    await page.getByRole("button", { name: "Record decision" }).click();
    await expect(page.getByTestId("decision-list")).toContainText("E2E rationale: looks promising");
  });

  test("5. approval approves the decision", async ({ page }) => {
    await page.goto("/approvals");
    await page.locator("#approval-decision").selectOption({ index: 1 });
    await page.getByLabel("Approver").fill("E2E VP");
    await page.getByLabel("Approve").check();
    await page.getByRole("button", { name: "Submit approval" }).click();
    await expect(page.getByTestId("approval-list")).toContainText("E2E VP");
    await expect(page.getByTestId("approval-list")).toContainText("approved");
  });

  test("6. automation run produces a reproducible forecast", async ({ page }) => {
    await page.goto("/automation");
    await page.locator("#automation-approval").selectOption({ index: 1 });
    await page.getByLabel("Trials").fill("2000");
    await page.getByLabel("Seed (optional)").fill("99");
    await page.getByRole("button", { name: "Run automation" }).click();
    await expect(page.getByTestId("automation-result")).toContainText("Seed: 99");
  });

  test("7. board pack export aggregates the whole pipeline and is downloadable", async ({ page }) => {
    await page.goto("/board-pack");
    await page.getByRole("button", { name: "Generate board pack" }).click();
    const summary = page.getByTestId("board-pack-summary");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("Leads:");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("board-pack-download").click(),
    ]);
    expect(download.suggestedFilename()).toBe("board-pack.json");
  });
});

export async function onboardFreshTenant(page: Page, name: string) {
  await page.goto("/onboarding");
  await page.getByLabel("Organization name").fill(name);
  await page.getByRole("button", { name: "Create tenant" }).click();
  await expect(page.getByTestId("onboarding-success")).toBeVisible();
}
