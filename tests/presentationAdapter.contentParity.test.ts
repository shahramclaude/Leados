import { describe, expect, it } from "vitest";
import { adaptPresentation, type AdaptationProfileInput } from "@/lib/adaptation/presentationAdapter";
import { factsForDomain } from "@/lib/adaptation/seedFacts";
import { defaultExpertise, type ExpertiseLevel, type ExpertiseScore } from "@/lib/familiarity";
import { DEFAULT_STYLE, type CognitiveStyleProfile } from "@/lib/humanNeeds";

const NOW = Date.parse("2026-01-15T00:00:00Z");

function expertiseAt(level: ExpertiseLevel): ExpertiseScore {
  const score = level === "novice" ? 0.1 : level === "intermediate" ? 0.5 : 0.9;
  return { domain: "risk", score, level, confidence: 0.8, sampleSize: 10, asOf: NOW };
}

function styleAt(visual: number, detail: number): CognitiveStyleProfile {
  return {
    ...DEFAULT_STYLE,
    visualVsTabular: { value: visual, confidence: 0.8 },
    detailVsSummary: { value: detail, confidence: 0.8 },
  };
}

const PROFILE_MATRIX: AdaptationProfileInput[] = [
  { domain: "risk", expertise: expertiseAt("novice"), style: DEFAULT_STYLE, densityModeOverride: null, adaptationPaused: false, standardViewForced: false },
  { domain: "risk", expertise: expertiseAt("intermediate"), style: styleAt(0.6, 0.4), densityModeOverride: null, adaptationPaused: false, standardViewForced: false },
  { domain: "risk", expertise: expertiseAt("expert"), style: styleAt(-0.7, 0.9), densityModeOverride: null, adaptationPaused: false, standardViewForced: false },
  { domain: "risk", expertise: defaultExpertise("risk", NOW), style: DEFAULT_STYLE, densityModeOverride: "dense", adaptationPaused: false, standardViewForced: false },
  { domain: "risk", expertise: expertiseAt("expert"), style: styleAt(0.9, 0.9), densityModeOverride: null, adaptationPaused: true, standardViewForced: false },
  { domain: "risk", expertise: expertiseAt("novice"), style: DEFAULT_STYLE, densityModeOverride: null, adaptationPaused: false, standardViewForced: true },
  {
    domain: "risk",
    expertise: expertiseAt("expert"),
    style: styleAt(0.5, 0.5),
    densityModeOverride: null,
    adaptationPaused: false,
    standardViewForced: false,
    usageWeightedOrder: ["risk-3", "risk-4", "risk-1", "risk-2"], // attempts to bury two criticals — guard must clamp this
  },
];

describe("content parity gate: adaptation changes form, never substance", () => {
  const facts = factsForDomain("risk");
  const factIds = new Set(facts.map((f) => f.id));

  it("returns the identical fact id set across every adaptation state", () => {
    for (const profile of PROFILE_MATRIX) {
      const result = adaptPresentation(facts, profile);
      const resultIds = new Set(result.facts.map((f) => f.id));
      expect(resultIds).toEqual(factIds);
      expect(result.order.length).toBe(facts.length);
      expect(new Set(result.order)).toEqual(factIds);
    }
  });

  it("never mutates any fact's value, severity, or detail text across adaptation states", () => {
    const baseline = adaptPresentation(facts, PROFILE_MATRIX[0]).facts;
    for (const profile of PROFILE_MATRIX) {
      const result = adaptPresentation(facts, profile).facts;
      for (const fact of baseline) {
        const match = result.find((f) => f.id === fact.id);
        expect(match).toBeDefined();
        expect(match).toEqual(fact);
      }
    }
  });

  it("never demotes a critical/high fact below the neutral default rank, even when usage data tries to", () => {
    const attack = PROFILE_MATRIX[PROFILE_MATRIX.length - 1];
    const result = adaptPresentation(facts, attack);
    const neutral = adaptPresentation(facts, { ...attack, usageWeightedOrder: undefined }).order;
    const criticalIds = facts.filter((f) => f.severity === "critical" || f.severity === "high").map((f) => f.id);
    for (const id of criticalIds) {
      expect(result.order.indexOf(id)).toBeLessThanOrEqual(neutral.indexOf(id));
    }
  });

  it("standard-view-forced and paused states both render the pure neutral default order with zero emphasis/sequence actions", () => {
    const pausedResult = adaptPresentation(facts, PROFILE_MATRIX[4]);
    const standardResult = adaptPresentation(facts, PROFILE_MATRIX[5]);
    for (const result of [pausedResult, standardResult]) {
      expect(result.actions.every((a) => a.class === "presentation")).toBe(true);
      expect(result.densityMode).toBe("standard");
    }
  });
});
