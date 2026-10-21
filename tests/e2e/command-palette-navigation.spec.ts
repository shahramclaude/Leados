import { test, expect } from "@playwright/test";

test.describe("Golden journey 9: command-palette-only navigation", () => {
  test("every primary page is reachable via keyboard using only the command palette", async ({ page }) => {
    await page.goto("/");

    // Open with the keyboard shortcut (not a click) — zero-mouse navigation.
    await page.keyboard.press("Control+k");
    await expect(page.getByTestId("command-palette")).toBeVisible();

    await page.getByTestId("command-palette-input").fill("Findings");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/findings$/);

    await page.keyboard.press("Control+k");
    await expect(page.getByTestId("command-palette")).toBeVisible();
    await page.getByTestId("command-palette-input").fill("board");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/board-pack$/);

    // Arrow-key navigation without typing a filter at all.
    await page.keyboard.press("Control+k");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page).not.toHaveURL(/\/board-pack$/);
  });

  test("Escape closes the palette without navigating", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+k");
    await expect(page.getByTestId("command-palette")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("command-palette")).toHaveCount(0);
    await expect(page).toHaveURL("/");
  });
});
