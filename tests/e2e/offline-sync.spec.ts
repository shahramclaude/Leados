import { test, expect } from "@playwright/test";
import { onboardFreshTenant } from "./golden-journey.spec";

test.describe("Golden journey 8: offline-write sync", () => {
  test("a capture made while offline is queued locally and syncs automatically once back online", async ({ page, context }) => {
    await onboardFreshTenant(page, `Offline Tenant ${Date.now()}`);

    await page.goto("/capture");
    await context.setOffline(true);

    const leadName = `Offline Lead ${Date.now()}`;
    await page.getByLabel("Lead name").fill(leadName);
    await page.getByRole("button", { name: "Capture lead" }).click();

    await expect(page.getByTestId("offline-queue")).toContainText("queued offline");

    await context.setOffline(false);
    // Browser fires a real `online` event once connectivity is restored;
    // the capture page listens for it and flushes the queue automatically.
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    await expect(page.getByTestId("offline-queue")).toHaveCount(0, { timeout: 10000 });
    await expect(page.getByTestId("lead-list")).toContainText(leadName);
  });
});
