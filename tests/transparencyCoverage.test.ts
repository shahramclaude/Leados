import { describe, expect, it } from "vitest";
import { adaptPresentation, type AdaptationProfileInput } from "@/lib/adaptation/presentationAdapter";
import { factsForDomain } from "@/lib/adaptation/seedFacts";
import { computeCoverage } from "@/lib/adaptation/transparencyCoverage";
import { DEFAULT_STYLE } from "@/lib/humanNeeds";
import type { ExpertiseScore } from "@/lib/familiarity";
import { ADAPTATION_ASSURANCE_REGISTRY } from "@/lib/assurance/registry";
import { BANNED_PATTERNS } from "@/lib/adaptation/manipulationGuard";

const NOW = Date.parse("2026-01-15T00:00:00Z");

function profileFor(overrides: Partial<AdaptationProfileInput> = {}): AdaptationProfileInput {
  const expertise: ExpertiseScore = { domain: "finance", score: 0.5, level: "intermediate", confidence: 0.6, sampleSize: 5, asOf: NOW };
  return {
    domain: "finance",
    expertise,
    style: DEFAULT_STYLE,
    densityModeOverride: null,
    adaptationPaused: false,
    standardViewForced: false,
    ...overrides,
  };
}

describe("transparency coverage gate: every adaptation class is explained", () => {
  it("covers all three classes even when only presentation-class actions fired", () => {
    const facts = factsForDomain("finance");
    const result = adaptPresentation(facts, profileFor());
    const coverage = computeCoverage(result);
    const classes = coverage.map((c) => c.class).sort();
    expect(classes).toEqual(["emphasis", "presentation", "sequence"]);
    for (const entry of coverage) {
      expect(entry.explanation.length).toBeGreaterThan(10);
    }
    const presentationEntry = coverage.find((c) => c.class === "presentation");
    expect(presentationEntry?.applied).toBe(true);
    const emphasisEntry = coverage.find((c) => c.class === "emphasis");
    expect(emphasisEntry?.applied).toBe(false); // not used in this view, but still explained
  });

  it("covers sequence as applied when a usage-weighted reorder is accepted by the guard", () => {
    const facts = factsForDomain("finance");
    const neutral = adaptPresentation(facts, profileFor()).order;
    const promote = [...neutral].reverse(); // may or may not be guard-safe; guard will clamp if needed
    const result = adaptPresentation(facts, profileFor({ usageWeightedOrder: promote }));
    const coverage = computeCoverage(result);
    const sequenceEntry = coverage.find((c) => c.class === "sequence");
    expect(sequenceEntry?.examples.length).toBeGreaterThan(0);
  });

  it("the assurance registry documents a control for every gate this part introduces", () => {
    const ids = ADAPTATION_ASSURANCE_REGISTRY.map((c) => c.id);
    expect(ids).toContain("content-parity");
    expect(ids).toContain("manipulation-guard");
    expect(ids).toContain("transparency-coverage");
    expect(ids).toContain("expertise-model-properties");
    expect(ids).toContain("reset-pause-one-interaction");
    for (const control of ADAPTATION_ASSURANCE_REGISTRY) {
      expect(control.verifiedBy.length).toBeGreaterThan(0);
    }
  });

  it("every banned pattern has a human-readable title and description for the panel", () => {
    expect(BANNED_PATTERNS.length).toBeGreaterThanOrEqual(6);
    for (const pattern of BANNED_PATTERNS) {
      expect(pattern.title.length).toBeGreaterThan(0);
      expect(pattern.description.length).toBeGreaterThan(0);
    }
  });
});
