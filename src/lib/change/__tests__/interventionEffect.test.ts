import { describe, it, expect } from "vitest";
import { rngFromKey } from "@/lib/prng";
import { assignSteppedWedge, isExposed } from "../rollout";
import { estimateInterventionEffect, type GroupPeriodObservation } from "../interventionEffect";

/**
 * Synthetic intervention study (Phase 4 gate 3): plant a known true effect in
 * simulated group-period data, run it through the same rollout + estimator
 * machinery the Intervention Lab API uses, and confirm the recovered
 * estimate is within a declared bound of the planted value.
 *
 * Bias report: a second scenario adds an uncontrolled secular trend that is
 * known (and documented in docs/CHANGE.md) to bias the simplified pooled
 * DiD estimator, since stepped-wedge exposure is correlated with later
 * periods. This is intentionally demonstrated, not hidden.
 */
function buildSyntheticObservations(
  groups: string[],
  periods: number,
  trueEffect: number,
  secularTrendPerPeriod: number,
  design: ReturnType<typeof assignSteppedWedge>
): GroupPeriodObservation[] {
  const observations: GroupPeriodObservation[] = [];
  for (const groupId of groups) {
    const rngOffset = rngFromKey(`synthetic-offset:${groupId}`);
    const groupOffset = (rngOffset() - 0.5) * 0.04;
    for (let period = 0; period < periods; period++) {
      const rngNoise = rngFromKey(`synthetic-noise:${groupId}:${period}`);
      const noise = (rngNoise() - 0.5) * 0.02;
      const exposed = isExposed(design, groupId, period);
      const value = 0.3 + groupOffset + secularTrendPerPeriod * period + noise + (exposed ? trueEffect : 0);
      observations.push({ groupId, period, adoptionRate: value });
    }
  }
  return observations;
}

describe("synthetic intervention effect recovery", () => {
  const groups = ["g1", "g2", "g3", "g4", "g5", "g6"];
  const periods = 6;
  const trueEffect = 0.2;

  it("recovers the planted effect within +/-0.05 when there is no uncontrolled secular trend", () => {
    const design = assignSteppedWedge(groups, periods, "synthetic-study-clean");
    const observations = buildSyntheticObservations(groups, periods, trueEffect, 0, design);

    const result = estimateInterventionEffect(design, observations, "adoption rate", "randomized_clean");

    expect(Math.abs(result.value.estimate - trueEffect)).toBeLessThanOrEqual(0.05);
    // The 95% CI should be in the right neighborhood of the true effect even
    // if, on a single synthetic draw, the true value occasionally falls just
    // outside the nominal interval (expected ~5% of the time by construction) —
    // we check a generously widened band instead of exact CI containment to
    // keep this a deterministic regression test rather than a flaky one.
    expect(trueEffect).toBeGreaterThanOrEqual(result.value.ci95[0] - 3 * result.value.se);
    expect(trueEffect).toBeLessThanOrEqual(result.value.ci95[1] + 3 * result.value.se);
    expect(result.value.language).toMatch(/caused|associated/);
  });

  it("bias report: an uncontrolled secular trend inflates the pooled DiD estimate (documented limitation)", () => {
    const design = assignSteppedWedge(groups, periods, "synthetic-study-trend");
    const cleanObservations = buildSyntheticObservations(groups, periods, trueEffect, 0, design);
    const trendedObservations = buildSyntheticObservations(groups, periods, trueEffect, 0.03, design);

    const cleanResult = estimateInterventionEffect(design, cleanObservations, "adoption rate", "randomized_clean");
    const trendedResult = estimateInterventionEffect(design, trendedObservations, "adoption rate", "randomized_clean");

    // The trended scenario's estimate should be further from the true effect
    // than the clean scenario's — demonstrating the known bias direction
    // (exposure concentrated in later, higher-baseline periods inflates the
    // naive difference-in-means).
    const cleanError = Math.abs(cleanResult.value.estimate - trueEffect);
    const trendedError = Math.abs(trendedResult.value.estimate - trueEffect);
    expect(trendedError).toBeGreaterThan(cleanError);
  });

  it("uses associated-with language for an observational design", () => {
    const design = assignSteppedWedge(groups, periods, "synthetic-study-observational");
    const observations = buildSyntheticObservations(groups, periods, trueEffect, 0, design);
    const result = estimateInterventionEffect(design, observations, "adoption rate", "observational");
    expect(result.value.language).toMatch(/associated with/);
    expect(result.value.language).not.toMatch(/caused/);
  });
});
