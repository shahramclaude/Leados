import { describe, expect, it } from "vitest";
import { accuracyFromHistory, mulberry32, runMonteCarlo } from "../monteCarlo";
import { ForecastCache, hashEvidence } from "../forecastCache";
import { generateForecastHistory } from "../goldenDataset";

describe("Monte Carlo forecasting with uncertainty", () => {
  it("is deterministic given the same seed", async () => {
    const input = {
      subject: "test",
      drivers: [{ name: "a", mean: 100, stdDev: 10 }],
      trials: 500,
      seed: 7,
    };
    const r1 = await runMonteCarlo(input);
    const r2 = await runMonteCarlo(input);
    expect(r1.distribution.p50).toBeCloseTo(r2.distribution.p50, 6);
  });

  it("produces a coherent p10 <= p50 <= p90 ordering", async () => {
    const result = await runMonteCarlo({
      subject: "test",
      drivers: [
        { name: "a", mean: 1000, stdDev: 200 },
        { name: "b", mean: 500, stdDev: 50 },
      ],
      trials: 2000,
      seed: 1,
    });
    expect(result.distribution.p10).toBeLessThanOrEqual(result.distribution.p50);
    expect(result.distribution.p50).toBeLessThanOrEqual(result.distribution.p90);
  });

  it("a scenario shift moves the distribution by roughly the shift amount", async () => {
    const baseInput = { subject: "test", drivers: [{ name: "a", mean: 1000, stdDev: 50 }], trials: 3000, seed: 3 };
    const base = await runMonteCarlo(baseInput);
    const shifted = await runMonteCarlo({
      ...baseInput,
      scenario: { name: "boost", driverDeltas: { a: 300 } },
    });
    expect(shifted.distribution.p50 - base.distribution.p50).toBeGreaterThan(250);
    expect(shifted.distribution.p50 - base.distribution.p50).toBeLessThan(350);
  });

  it("accuracyFromHistory computes MAPE against the golden forecast history", () => {
    const history = generateForecastHistory();
    const accuracy = accuracyFromHistory(history);
    expect(accuracy).toBeDefined();
    expect(accuracy!.value).toBeGreaterThan(0);
    expect(accuracy!.value).toBeLessThan(0.5);
    expect(accuracy!.historyPoints).toBe(history.length);
  });

  it("mulberry32 is a reproducible PRNG", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect(a()).toBe(b());
  });
});

describe("ForecastCache: evidence-keyed invalidation, not time-based", () => {
  it("serves a cached result when the evidence hash is unchanged", async () => {
    const cache = new ForecastCache();
    const input = { subject: "s", drivers: [{ name: "a", mean: 10, stdDev: 1 }], trials: 100, seed: 1 };
    expect(cache.get(input)).toBeUndefined();
    const result = await runMonteCarlo(input);
    cache.set(input, result);
    expect(cache.get(input)).toEqual(result);
  });

  it("invalidates automatically when the evidence (inputs) change", async () => {
    const cache = new ForecastCache();
    const input = { subject: "s", drivers: [{ name: "a", mean: 10, stdDev: 1 }], trials: 100, seed: 1 };
    const result = await runMonteCarlo(input);
    cache.set(input, result);

    const changedInput = { ...input, drivers: [{ name: "a", mean: 50, stdDev: 1 }] };
    expect(cache.get(changedInput)).toBeUndefined();
    expect(hashEvidence(input)).not.toBe(hashEvidence(changedInput));
  });

  it("explicit invalidateSubject clears cached entries regardless of hash", async () => {
    const cache = new ForecastCache();
    const input = { subject: "s", drivers: [{ name: "a", mean: 10, stdDev: 1 }], trials: 100, seed: 1 };
    const result = await runMonteCarlo(input);
    cache.set(input, result);
    cache.invalidateSubject("s");
    expect(cache.get(input)).toBeUndefined();
  });
});
