import { describe, it, expect } from "vitest";
import { createRng, rngFromKey, shuffle, seedFromString } from "@/lib/prng";
import { ewma, ewmaMomentum } from "@/lib/stats/drift";
import { differenceInMeans, phraseEffect } from "@/lib/stats/estimators";
import { aggregationGate, K_ANONYMITY_THRESHOLD, containsBannedField } from "@/lib/privacy/aggregation";

describe("prng (Part 01 stand-in)", () => {
  it("is deterministic for a fixed seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("produces values in [0,1)", () => {
    const rng = createRng(7);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("derives a stable seed from a string key", () => {
    expect(seedFromString("abc")).toBe(seedFromString("abc"));
    expect(seedFromString("abc")).not.toBe(seedFromString("abd"));
  });

  it("shuffle is a permutation of the input and deterministic by key", () => {
    const items = [1, 2, 3, 4, 5];
    const shuffled = shuffle(items, rngFromKey("k"));
    expect(shuffled.sort()).toEqual(items.sort());
    expect(shuffle(items, rngFromKey("k"))).toEqual(shuffle(items, rngFromKey("k")));
  });
});

describe("ewma / drift (Part 04 stand-in)", () => {
  it("smooths a constant series to the same constant", () => {
    const series = [5, 5, 5, 5];
    expect(ewma(series, 0.5)).toEqual([5, 5, 5, 5]);
  });

  it("momentum is positive for an increasing series and negative for a decreasing one", () => {
    expect(ewmaMomentum([1, 2, 3, 4])).toBeGreaterThan(0);
    expect(ewmaMomentum([4, 3, 2, 1])).toBeLessThan(0);
  });
});

describe("estimators + language rule (Part 05 stand-in)", () => {
  it("computes a sane difference in means with a CI that contains the true difference for low-noise data", () => {
    const treatment = [0.52, 0.5, 0.53, 0.51, 0.54, 0.5];
    const control = [0.3, 0.31, 0.29, 0.3, 0.32, 0.3];
    const result = differenceInMeans(treatment, control);
    expect(result.estimate).toBeCloseTo(0.21, 1);
    expect(result.ci95[0]).toBeLessThan(result.estimate);
    expect(result.ci95[1]).toBeGreaterThan(result.estimate);
  });

  it("only uses causal language for a declared clean randomized design", () => {
    expect(phraseEffect(0.1, "randomized_clean", "adoption")).toMatch(/caused/);
    expect(phraseEffect(0.1, "observational", "adoption")).toMatch(/associated with/);
    expect(phraseEffect(0.1, "observational", "adoption")).not.toMatch(/caused/);
  });
});

describe("k-anonymity aggregation gate (Part 09 stand-in)", () => {
  it("suppresses below threshold and computes above it", () => {
    const below = aggregationGate(K_ANONYMITY_THRESHOLD - 1, () => 42);
    expect(below.ok).toBe(false);
    const above = aggregationGate(K_ANONYMITY_THRESHOLD, () => 42);
    expect(above.ok).toBe(true);
    if (above.ok) expect(above.value).toBe(42);
  });

  it("never invokes compute() when below threshold (no incidental leakage via side effects)", () => {
    let called = false;
    aggregationGate(1, () => {
      called = true;
      return 1;
    });
    expect(called).toBe(false);
  });

  it("detects banned individual-level fields in a nested payload", () => {
    expect(containsBannedField({ a: { b: { sentimentScore: 1 } } })).toBe("sentimentScore");
    expect(containsBannedField({ a: { b: 1 } })).toBeNull();
  });
});
