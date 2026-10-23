import { describe, expect, it } from "vitest";
import { cashReconciliationResidual, evaluateCovenant } from "@/lib/calc/treasury";

describe("cashReconciliationResidual", () => {
  it("is zero when book and bank tie out through outstanding items", () => {
    expect(cashReconciliationResidual(10500, 10000, 500)).toBe(0);
  });

  it("reports a non-zero residual when the identity does not hold", () => {
    expect(cashReconciliationResidual(10500, 10000, 300)).toBe(200);
  });
});

describe("evaluateCovenant", () => {
  it("is healthy with ample headroom on a max-direction covenant", () => {
    const result = evaluateCovenant("max", 4.0, 2.0);
    expect(result.status).toBe("healthy");
    expect(result.headroomPct).toBeCloseTo(0.5, 5);
  });

  it("is in breach when current exceeds threshold on a max-direction covenant", () => {
    const result = evaluateCovenant("max", 4.0, 4.5);
    expect(result.status).toBe("breach");
  });

  it("is in watch territory just inside the threshold", () => {
    const result = evaluateCovenant("max", 4.0, 3.7);
    expect(result.status).toBe("watch");
  });

  it("is healthy when current comfortably exceeds threshold on a min-direction covenant", () => {
    const result = evaluateCovenant("min", 2.0, 3.0);
    expect(result.status).toBe("healthy");
  });

  it("is in breach when current falls below threshold on a min-direction covenant", () => {
    const result = evaluateCovenant("min", 2.0, 1.5);
    expect(result.status).toBe("breach");
  });
});
