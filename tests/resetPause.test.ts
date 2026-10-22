import { describe, expect, it } from "vitest";
import { adaptPresentation, type AdaptationProfileInput } from "@/lib/adaptation/presentationAdapter";
import { factsForDomain, defaultOrderFor } from "@/lib/adaptation/seedFacts";
import { DEFAULT_STYLE } from "@/lib/humanNeeds";
import type { ExpertiseScore } from "@/lib/familiarity";

const NOW = Date.parse("2026-01-15T00:00:00Z");

function heavilyAdaptedProfile(): AdaptationProfileInput {
  const expertise: ExpertiseScore = { domain: "tech", score: 0.95, level: "expert", confidence: 0.9, sampleSize: 40, asOf: NOW };
  const facts = factsForDomain("tech");
  const neutral = defaultOrderFor(facts);
  return {
    domain: "tech",
    expertise,
    style: { ...DEFAULT_STYLE, visualVsTabular: { value: -0.9, confidence: 0.9 } },
    densityModeOverride: "dense",
    adaptationPaused: false,
    standardViewForced: false,
    usageWeightedOrder: [...neutral].reverse(),
  };
}

describe("reset/pause gate: restores the neutral default within one interaction", () => {
  const facts = factsForDomain("tech");
  const neutralOrder = defaultOrderFor(facts);

  it("pausing adaptation (one flag flip) immediately yields the neutral default view, no second step required", () => {
    const before = adaptPresentation(facts, heavilyAdaptedProfile());
    expect(before.densityMode).not.toBe("standard"); // confirm it really was adapted first

    // "One interaction" = flip adaptationPaused to true. Nothing else changes.
    const paused = { ...heavilyAdaptedProfile(), adaptationPaused: true };
    const after = adaptPresentation(facts, paused);

    expect(after.densityMode).toBe("standard");
    expect(after.layout).toBe("hybrid");
    expect(after.order).toEqual(neutralOrder);
    expect(after.actions.every((a) => a.class === "presentation")).toBe(true);
  });

  it("resetting to default (clearing override + un-pausing in one call) restores the auto-adaptive baseline", () => {
    const adapted = heavilyAdaptedProfile();
    // Reset-to-default == one object patch: densityModeOverride -> null, adaptationPaused -> false.
    const resetProfile: AdaptationProfileInput = { ...adapted, densityModeOverride: null, adaptationPaused: false, usageWeightedOrder: undefined };
    const result = adaptPresentation(facts, resetProfile);

    // Density now derives purely from expertise again (expert -> dense is a legitimate
    // adaptive *default*, not a manual override) — the key property is it's no longer "stuck"
    // on a stale manual choice and the order is back to the neutral default.
    expect(result.order).toEqual(neutralOrder);
    expect(result.densityMode).toBe("dense"); // expert-level auto density, transparently explained
    const densityAction = result.actions.find((a) => a.id.endsWith("-density"));
    expect(densityAction?.description).not.toContain("manually set");
  });

  it("standard view toggle (always available) restores the default in a single click, independent of stored profile", () => {
    const adapted = heavilyAdaptedProfile();
    const standard = { ...adapted, standardViewForced: true };
    const result = adaptPresentation(facts, standard);
    expect(result.order).toEqual(neutralOrder);
    expect(result.densityMode).toBe("standard");
  });
});
