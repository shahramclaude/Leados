import { describe, expect, it } from "vitest";
import { loadSCM, simulate } from "../scm";
import { regressionAdjustmentEstimate } from "../estimation";
import { claimFreshness, negativeControlTest, placeboTest } from "../validation";
import { mulberry32 } from "../rng";
import type { StructuralCausalModel } from "../types";

const scm: StructuralCausalModel = {
  id: "validation-test",
  version: "1",
  label: "validation-test",
  description: "",
  createdAt: new Date().toISOString(),
  variables: [
    { id: "Z", label: "Z", kind: "metric", domain: "continuous", description: "", observable: true },
    { id: "X", label: "X", kind: "metric", domain: "continuous", description: "", observable: true },
    { id: "Y", label: "Y", kind: "outcome", domain: "continuous", description: "", observable: true },
    { id: "N", label: "N (negative control)", kind: "metric", domain: "continuous", description: "unrelated", observable: true },
  ],
  assignments: [
    { variable: "Z", parents: [], fn: { type: "linear", coefficients: {}, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
    { variable: "N", parents: [], fn: { type: "linear", coefficients: {}, intercept: 5 }, noise: { type: "normal", mean: 0, sd: 2 } },
    { variable: "X", parents: ["Z"], fn: { type: "linear", coefficients: { Z: 1 }, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
    { variable: "Y", parents: ["X", "Z"], fn: { type: "linear", coefficients: { X: 2, Z: 1 }, intercept: 0 }, noise: { type: "normal", mean: 0, sd: 1 } },
  ],
};

describe("placebo test", () => {
  it("vanishes the effect when treatment is shuffled", () => {
    const model = loadSCM(scm);
    const data = simulate(model, 1200, mulberry32(31));
    const real = regressionAdjustmentEstimate(data, "X", "Y", ["Z"]);
    const placebo = placeboTest(data, "X", "Y", ["Z"], real.ate, { permutations: 80 });

    expect(Math.abs(placebo.placeboMean)).toBeLessThan(0.3);
    expect(placebo.passed).toBe(true);
  });
});

describe("negative control", () => {
  it("detects no spurious effect on an unrelated outcome", () => {
    const model = loadSCM(scm);
    const data = simulate(model, 1200, mulberry32(32));
    const result = negativeControlTest(data, "X", "N", ["Z"]);
    expect(result?.passed).toBe(true);
  });
});

describe("claim freshness / expiry", () => {
  it("marks a claim fresh, aging, and expired at the right boundaries", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const fresh = { revalidateBy: "2026-06-01T00:00:00.000Z" };
    const aging = { revalidateBy: "2026-01-10T00:00:00.000Z" };
    const expired = { revalidateBy: "2025-12-01T00:00:00.000Z" };

    expect(claimFreshness(fresh, now)).toBe("fresh");
    expect(claimFreshness(aging, now)).toBe("aging");
    expect(claimFreshness(expired, now)).toBe("expired");
  });
});
