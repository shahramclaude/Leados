import { describe, expect, it } from "vitest";
import { computeAutomationScore } from "./automation";

describe("seam 6: process mining feeds automation scoring", () => {
  it("scores the share of mined time that is automatable", () => {
    const result = computeAutomationScore([
      { step: "data entry", durationMs: 6000, automatable: true },
      { step: "exception review", durationMs: 4000, automatable: false },
    ]);
    expect(result.score).toBe(60);
    expect(result.basis.automatableSteps).toEqual(["data entry"]);
  });

  it("returns 0 for an empty mined log instead of NaN", () => {
    const result = computeAutomationScore([]);
    expect(result.score).toBe(0);
    expect(Number.isNaN(result.score)).toBe(false);
  });

  it("known gap: does not yet discount steps that are automatable but low-repetition one-offs", () => {
    const result = computeAutomationScore([{ step: "rare one-off", durationMs: 1000, automatable: true }]);
    // Documented in EVIDENCE-LEDGER.md as a scoring gap, not silently hidden.
    expect(result.score).toBe(100);
  });
});
