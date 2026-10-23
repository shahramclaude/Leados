import { describe, expect, it } from "vitest";
import { simulateHerding } from "../simulation";

describe("herding simulation: anonymity vs open visibility", () => {
  it("open mode collapses dispersion far more than anonymous/delayed mode for the same seed", () => {
    const seed = 1337;
    const open = simulateHerding(seed, "open");
    const anon = simulateHerding(seed, "anonymous_delayed");

    expect(open.dispersionCollapseRatio).toBeLessThan(anon.dispersionCollapseRatio);
    // Open-mode herding should wipe out the majority of initial disagreement.
    expect(open.dispersionCollapseRatio).toBeLessThan(0.5);
    // Anonymous/delayed mode should preserve the bulk of initial disagreement.
    expect(anon.dispersionCollapseRatio).toBeGreaterThan(0.6);
  });

  it("is deterministic for a fixed seed (reproducible verification log numbers)", () => {
    const a = simulateHerding(99, "open");
    const b = simulateHerding(99, "open");
    expect(a).toEqual(b);
  });

  it("holds across multiple seeds, not just a cherry-picked one", () => {
    const seeds = [1, 7, 42, 2024, 999983];
    for (const seed of seeds) {
      const open = simulateHerding(seed, "open");
      const anon = simulateHerding(seed, "anonymous_delayed");
      expect(open.dispersionCollapseRatio).toBeLessThan(anon.dispersionCollapseRatio);
    }
  });
});
