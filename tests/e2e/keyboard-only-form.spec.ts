import { test, expect } from "@playwright/test";

test.describe("Golden journey 10: keyboard-only completion of a complex form", () => {
  test("the onboarding form can be completed and submitted using only Tab/Type/Enter", async ({ page }) => {
    await page.goto("/onboarding");

    // Tab from the top of the document until the name field receives focus,
    // proving it is reachable in the natural tab order (no mouse click).
    let focusedId: string | null = null;
    for (let i = 0; i < 15 && focusedId !== "tenant-name"; i += 1) {
      await page.keyboard.press("Tab");
      focusedId = await page.evaluate(() => document.activeElement?.id ?? null);
    }
    expect(focusedId).toBe("tenant-name");

    await page.keyboard.type(`Keyboard Tenant ${Date.now()}`);
    // Submit via Enter inside the text field (standard form submit behavior).
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("onboarding-success")).toBeVisible();
  });

  test("the multi-field decision form (select, select, textarea, submit) is fully keyboard-operable", async ({ page }) => {
    // Seed a tenant + lead + finding via the UI first (keyboard not required here).
    await page.goto("/onboarding");
    await page.getByLabel("Organization name").fill(`KB Form Tenant ${Date.now()}`);
    await page.getByRole("button", { name: "Create tenant" }).click();
    await expect(page.getByTestId("onboarding-success")).toBeVisible();

    await page.goto("/capture");
    const leadName = `KB Lead ${Date.now()}`;
    await page.getByLabel("Lead name").fill(leadName);
    await page.getByRole("button", { name: "Capture lead" }).click();
    await expect(page.getByTestId("capture-status")).toBeVisible();

    await page.goto("/findings");
    await page.getByLabel("Lead").selectOption({ label: leadName });
    await page.getByLabel("Summary").fill("Keyboard-only finding");
    await page.getByRole("button", { name: "Create finding" }).click();
    await expect(page.getByTestId("finding-list")).toContainText("Keyboard-only finding");

    // Now complete the Decision form using only the keyboard.
    await page.goto("/decisions");
    await page.locator("#decision-finding").focus();
    await page.keyboard.press("ArrowDown"); // open/choose first real option (skips disabled placeholder)
    await page.keyboard.press("Tab");
    await page.keyboard.press("ArrowDown"); // action: pursue -> watch
    await page.keyboard.press("Tab");
    await page.keyboard.type("Keyboard-only rationale");
    // Move focus to the submit button and activate with Space/Enter.
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("decision-list")).toContainText("Keyboard-only rationale");
  });
});
