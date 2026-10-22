import { describe, expect, it } from "vitest";
import { BackdatingViolation, brierScore, registerForesight, resolveForesight, SEED_FORESIGHT_CLAIMS } from "../registry";
import { summarizeCalibration } from "../calibration";

describe("foresight registration -> resolution -> Brier loop", () => {
  it("registers an open claim with an immutable registeredAt timestamp", () => {
    const claim = registerForesight({
      id: "fc-test-1",
      statement: "Test claim.",
      confidence: 0.7,
      horizon: "2026-Q3",
      registeredBy: "test-harness",
      registeredAt: "2026-01-01T00:00:00.000Z",
    });
    expect(claim.status).toBe("open");
    expect(claim.registeredAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("resolves a claim and computes the correct Brier component", () => {
    const claim = registerForesight({
      id: "fc-test-2",
      statement: "Test claim 2.",
      confidence: 0.8,
      horizon: "2026-Q3",
      registeredBy: "test-harness",
      registeredAt: "2026-01-01T00:00:00.000Z",
    });
    const resolved = resolveForesight(claim, true, "Resolved true in test.", "2026-02-01T00:00:00.000Z");
    expect(resolved.status).toBe("resolved");
    expect(resolved.brierComponent).toBeCloseTo((0.8 - 1) ** 2, 10);
  });

  it("rejects resolving a claim at a timestamp before it was registered (no backdating)", () => {
    const claim = registerForesight({
      id: "fc-test-3",
      statement: "Test claim 3.",
      confidence: 0.5,
      horizon: "2026-Q3",
      registeredBy: "test-harness",
      registeredAt: "2026-02-01T00:00:00.000Z",
    });
    expect(() => resolveForesight(claim, true, "backdated", "2026-01-01T00:00:00.000Z")).toThrow(BackdatingViolation);
  });

  it("rejects re-resolving an already-resolved claim", () => {
    const claim = registerForesight({
      id: "fc-test-4",
      statement: "Test claim 4.",
      confidence: 0.5,
      horizon: "2026-Q3",
      registeredBy: "test-harness",
      registeredAt: "2026-01-01T00:00:00.000Z",
    });
    const resolved = resolveForesight(claim, false, "first resolution", "2026-02-01T00:00:00.000Z");
    expect(() => resolveForesight(resolved, true, "second resolution", "2026-03-01T00:00:00.000Z")).toThrow(BackdatingViolation);
  });

  it("end to end: the seed ledger's resolved claims produce a finite Brier score in [0,1]", () => {
    const score = brierScore(SEED_FORESIGHT_CLAIMS);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("calibration summary separates open vs resolved claims correctly", () => {
    const summary = summarizeCalibration(SEED_FORESIGHT_CLAIMS);
    const resolvedCount = SEED_FORESIGHT_CLAIMS.filter((c) => c.status === "resolved").length;
    const openCount = SEED_FORESIGHT_CLAIMS.filter((c) => c.status === "open").length;
    expect(summary.resolvedCount).toBe(resolvedCount);
    expect(summary.openCount).toBe(openCount);
  });
});
