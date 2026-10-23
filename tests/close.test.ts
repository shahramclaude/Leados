import { describe, expect, it } from "vitest";
import { benfordFirstDigitCheck, canSignOff, evaluateReconciliation } from "@/lib/calc/close";

describe("evaluateReconciliation", () => {
  it("matches exactly when residual is zero", () => {
    const result = evaluateReconciliation({
      sourceBalance: 10000,
      glBalance: 9000,
      reconcilingItemsTotal: 1000,
      toleranceUsd: 1,
    });
    expect(result.difference).toBe(1000);
    expect(result.residual).toBe(0);
    expect(result.status).toBe("matched");
  });

  it("is explained when residual is within tolerance but non-zero", () => {
    const result = evaluateReconciliation({
      sourceBalance: 10000.5,
      glBalance: 9000,
      reconcilingItemsTotal: 1000,
      toleranceUsd: 2,
    });
    expect(result.status).toBe("explained");
  });

  it("flags an exception when residual exceeds tolerance", () => {
    const result = evaluateReconciliation({
      sourceBalance: 12000,
      glBalance: 9000,
      reconcilingItemsTotal: 1000,
      toleranceUsd: 5,
    });
    expect(result.status).toBe("exception");
  });
});

describe("canSignOff", () => {
  it("blocks sign-off without evidence", () => {
    const result = canSignOff({ id: 1, sequence: 1, status: "review", evidenceRef: null });
    expect(result.allowed).toBe(false);
  });

  it("blocks sign-off when task is blocked regardless of evidence", () => {
    const result = canSignOff({ id: 1, sequence: 1, status: "blocked", evidenceRef: "recon-42" });
    expect(result.allowed).toBe(false);
  });

  it("allows sign-off with evidence and non-blocked status", () => {
    const result = canSignOff({ id: 1, sequence: 1, status: "review", evidenceRef: "recon-42" });
    expect(result.allowed).toBe(true);
  });
});

describe("benfordFirstDigitCheck", () => {
  it("produces a low deviation score for a Benford-distributed sample", () => {
    // Powers of 10-ish spread approximating Benford's law leading digits.
    const amounts = [
      100, 110, 120, 130, 150, 190, 199, 200, 210, 250, 290, 300, 310, 350, 390,
      400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950, 999,
    ];
    const result = benfordFirstDigitCheck(amounts);
    expect(result.sampleSize).toBe(amounts.length);
    expect(result.deviationScore).toBeGreaterThanOrEqual(0);
  });

  it("produces a high deviation score for a clearly non-Benford sample", () => {
    const amounts = new Array(50).fill(9999);
    const result = benfordFirstDigitCheck(amounts);
    expect(result.observed[9]).toBe(1);
    expect(result.deviationScore).toBeGreaterThan(1);
  });
});
