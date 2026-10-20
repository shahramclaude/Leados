import { describe, expect, it } from "vitest";
import {
  assertLanguageMatchesIdentifiability,
  renderClaimSentence,
  scanForBannedLanguage,
} from "../language";
import type { CausalEstimate } from "../types";

function baseEstimate(overrides: Partial<CausalEstimate>): CausalEstimate {
  return {
    query: { effect: "oneOnOneFrequency", on: "retentionStays", population: "all" },
    identifiable: false,
    assumptions: [],
    adjustmentSet: [],
    confoundersSuspected: ["managerQuality"],
    evidence: [],
    minimumN: 0,
    sampleSize: 500,
    asOf: new Date().toISOString(),
    revalidateBy: new Date().toISOString(),
    ...overrides,
  };
}

describe("banned-language scanner", () => {
  it("flags causal verbs in arbitrary text", () => {
    const violations = scanForBannedLanguage("1:1 frequency causes retention to improve.");
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.map((v) => v.phrase)).toContain("causes");
  });

  it("finds no violations in association-safe phrasing", () => {
    const violations = scanForBannedLanguage("1:1 frequency is associated with retention.");
    expect(violations).toHaveLength(0);
  });
});

describe("rendering layer picks phrasing from CausalEstimate", () => {
  it("renders association language for a non-identifiable estimate", () => {
    const estimate = baseEstimate({ associationOnly: { r: 0.3, ci: [0.2, 0.4] } });
    const sentence = renderClaimSentence("1:1 frequency", "retention", estimate);
    expect(sentence.toLowerCase()).toContain("associated with");
    expect(() => assertLanguageMatchesIdentifiability(sentence, estimate)).not.toThrow();
  });

  it("renders causal language only when identifiable is true", () => {
    const estimate = baseEstimate({
      identifiable: true,
      adjustmentSet: ["teamSize"],
      estimate: { ate: 0.12, ci: [0.05, 0.19], method: "doubly-robust" },
      confoundersSuspected: [],
    });
    const sentence = renderClaimSentence("1:1 frequency", "retention", estimate);
    expect(sentence.toLowerCase()).toContain("drives");
  });

  it("throws if a non-identifiable estimate is rendered with banned causal language (regression guard)", () => {
    const estimate = baseEstimate({ associationOnly: { r: 0.3, ci: [0.2, 0.4] } });
    const badCopy = `1:1 frequency causes retention (r=${estimate.associationOnly!.r}).`;
    expect(() => assertLanguageMatchesIdentifiability(badCopy, estimate)).toThrow();
  });
});
