import { describe, expect, it } from "vitest";
import { applyChaosToRisk } from "./chaos";

describe("seam 3: chaos results update risk beliefs", () => {
  it("a breach pushes belief sharply toward 1", () => {
    const after = applyChaosToRisk(0.2, "breached");
    expect(after).toBeGreaterThan(0.6);
    expect(after).toBeLessThanOrEqual(1);
  });

  it("a hold pulls belief down, but gently (disconfirmation is cheaper than confirmation)", () => {
    const after = applyChaosToRisk(0.6, "held");
    expect(after).toBeLessThan(0.6);
    expect(after).toBeGreaterThan(0.4);
  });

  it("an inconclusive result leaves belief unchanged", () => {
    expect(applyChaosToRisk(0.33, "inconclusive")).toBe(0.33);
  });

  it("never produces a belief outside [0, 1]", () => {
    expect(applyChaosToRisk(0.99, "breached")).toBeLessThanOrEqual(1);
    expect(applyChaosToRisk(0.01, "held")).toBeGreaterThanOrEqual(0);
  });
});
