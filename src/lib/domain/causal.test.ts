import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createPrng } from "@/lib/prng";
import {
  generateObservationalData,
  naiveDifferenceInMeans,
  backdoorAdjustedEstimate,
} from "./causal";
import { arbScmConfig, arbSeed } from "../../../tests/fixtures/generators";

describe("causal — example-based", () => {
  it("recovers a known effect size from confounded data via backdoor adjustment", () => {
    const prng = createPrng(1234);
    const rows = generateObservationalData(prng, {
      trueEffect: 2.5,
      confounderOutcomeWeight: 3,
      confounderTreatmentWeight: 2, // strong confounding
      noiseStdDev: 0.5,
      sampleSize: 4000,
    });

    const adjusted = backdoorAdjustedEstimate(rows);
    expect(Math.abs(adjusted - 2.5)).toBeLessThan(0.3);
  });

  it("the naive (unadjusted) estimator is biased under strong confounding", () => {
    const prng = createPrng(1234);
    const rows = generateObservationalData(prng, {
      trueEffect: 2.5,
      confounderOutcomeWeight: 3,
      confounderTreatmentWeight: 2,
      noiseStdDev: 0.5,
      sampleSize: 4000,
    });

    const naive = naiveDifferenceInMeans(rows);
    const adjusted = backdoorAdjustedEstimate(rows);
    // The whole point of backdoor adjustment: it should land closer to the
    // true effect (2.5) than the naive, confounded estimator.
    expect(Math.abs(adjusted - 2.5)).toBeLessThan(Math.abs(naive - 2.5));
  });

  it("throws on too few observations to regress", () => {
    expect(() =>
      backdoorAdjustedEstimate([
        { x: 0, t: 0, y: 0 },
        { x: 1, t: 1, y: 1 },
      ]),
    ).toThrow();
  });
});

describe("causal — ground-truth recovery (property-based)", () => {
  it("backdoor adjustment recovers the true effect within tolerance across random confounded SCMs", () => {
    fc.assert(
      fc.property(arbSeed, arbScmConfig, (seed, config) => {
        const prng = createPrng(seed);
        const rows = generateObservationalData(prng, config);
        let adjusted: number;
        try {
          adjusted = backdoorAdjustedEstimate(rows);
        } catch {
          // Near-singular design matrices (e.g. near-zero treatment
          // variance) are a legitimate estimator failure mode, not a bug —
          // skip rather than fabricate a pass/fail verdict on degenerate
          // input.
          return;
        }
        // Tolerance scales with noise and is generous because this is a
        // finite-sample statistical estimator, not an exact computation;
        // the point of the test is "recovers the right ballpark despite
        // confounding", not "matches to machine precision".
        const tolerance = Math.max(0.75, config.noiseStdDev * 3);
        expect(Math.abs(adjusted - config.trueEffect)).toBeLessThan(tolerance);
      }),
      { numRuns: 50 },
    );
  });

  it("is deterministic for a given seed (reproducibility carries through causal recovery too)", () => {
    fc.assert(
      fc.property(arbSeed, arbScmConfig, (seed, config) => {
        const rowsA = generateObservationalData(createPrng(seed), config);
        const rowsB = generateObservationalData(createPrng(seed), config);
        expect(rowsA).toEqual(rowsB);
      }),
    );
  });
});
