import { describe, expect, it } from "vitest";
import { buildBoardPackSummary, runConsolidation } from "./consolidation";

describe("seam 4: global entities flow into consolidation -> board pack", () => {
  it("converts every entity to USD before summing", () => {
    const result = runConsolidation([
      { name: "UK Ltd", region: "EMEA", currency: "GBP", revenue: 100, costs: 40, fxRateToUsd: 1.25 },
      { name: "US Inc", region: "AMER", currency: "USD", revenue: 100, costs: 40, fxRateToUsd: 1 },
    ]);
    expect(result.totalRevenueUsd).toBe(225);
    expect(result.totalCostsUsd).toBe(90);
    expect(result.netUsd).toBe(135);
    expect(result.entityCount).toBe(2);
  });

  it("the board pack summary discloses FX methodology instead of presenting net margin as audited fact", () => {
    const result = runConsolidation([
      { name: "UK Ltd", region: "EMEA", currency: "GBP", revenue: 100, costs: 40, fxRateToUsd: 1.25 },
    ]);
    const summary = buildBoardPackSummary("2026-Q1", result);
    expect(summary).toContain("directional, not statutory");
    expect(summary).toContain("2026-Q1");
  });

  it("handles zero entities without dividing by zero", () => {
    const result = runConsolidation([]);
    const summary = buildBoardPackSummary("2026-Q1", result);
    expect(result.entityCount).toBe(0);
    expect(summary).toContain("0 entities");
  });

  it("surfaces a loss plainly instead of softening negative net results", () => {
    const result = runConsolidation([
      { name: "Loss Co", region: "AMER", currency: "USD", revenue: 50, costs: 200, fxRateToUsd: 1 },
    ]);
    const summary = buildBoardPackSummary("2026-Q1", result);
    expect(result.netUsd).toBeLessThan(0);
    expect(summary).toContain("LOSS THIS PERIOD");
  });

  it("discloses that intercompany eliminations are not applied (a known consolidation gap)", () => {
    const summary = buildBoardPackSummary("2026-Q1", runConsolidation([]));
    expect(summary).toContain("Intercompany eliminations are NOT applied");
  });
});
