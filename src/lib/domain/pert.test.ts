import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { pertEstimate, pertConfidenceBounds } from "./pert";
import { arbPertInputs } from "../../../tests/fixtures/generators";

describe("pert — example-based", () => {
  it("computes the textbook identity for a known triple", () => {
    const result = pertEstimate({ optimistic: 2, mostLikely: 4, pessimistic: 12 });
    expect(result.mean).toBeCloseTo((2 + 16 + 12) / 6, 10);
    expect(result.stdDev).toBeCloseTo((12 - 2) / 6, 10);
    expect(result.variance).toBeCloseTo(((12 - 2) / 6) ** 2, 10);
  });

  it("rejects out-of-order inputs", () => {
    expect(() =>
      pertEstimate({ optimistic: 5, mostLikely: 4, pessimistic: 10 }),
    ).toThrow();
    expect(() =>
      pertEstimate({ optimistic: 1, mostLikely: 10, pessimistic: 5 }),
    ).toThrow();
  });

  it("degenerates to a point estimate when all three inputs are equal", () => {
    const result = pertEstimate({ optimistic: 5, mostLikely: 5, pessimistic: 5 });
    expect(result.mean).toBe(5);
    expect(result.variance).toBe(0);
    expect(result.stdDev).toBe(0);
  });
});

describe("pert — property-based identities", () => {
  it("mean always lies within [optimistic, pessimistic]", () => {
    fc.assert(
      fc.property(arbPertInputs, (inputs) => {
        const { mean } = pertEstimate(inputs);
        expect(mean).toBeGreaterThanOrEqual(inputs.optimistic - 1e-9);
        expect(mean).toBeLessThanOrEqual(inputs.pessimistic + 1e-9);
      }),
    );
  });

  it("mean equals the weighted-average identity (o + 4m + p) / 6", () => {
    fc.assert(
      fc.property(arbPertInputs, (inputs) => {
        const { mean } = pertEstimate(inputs);
        const expected =
          (inputs.optimistic + 4 * inputs.mostLikely + inputs.pessimistic) / 6;
        expect(mean).toBeCloseTo(expected, 8);
      }),
    );
  });

  it("variance is monotonically non-decreasing in the spread (pessimistic - optimistic)", () => {
    fc.assert(
      fc.property(arbPertInputs, fc.double({ min: 0, max: 1000, noNaN: true }), (inputs, extra) => {
        const widened = {
          optimistic: Math.max(0, inputs.optimistic - extra),
          mostLikely: inputs.mostLikely,
          pessimistic: inputs.pessimistic + extra,
        };
        // Widening must keep ordering valid.
        fc.pre(widened.optimistic <= widened.mostLikely);
        const base = pertEstimate(inputs);
        const wide = pertEstimate(widened);
        expect(wide.variance).toBeGreaterThanOrEqual(base.variance - 1e-9);
      }),
    );
  });

  it("confidence bounds are always within [optimistic, pessimistic] and contain the mean", () => {
    fc.assert(
      fc.property(arbPertInputs, (inputs) => {
        const { mean } = pertEstimate(inputs);
        const { lower, upper } = pertConfidenceBounds(inputs);
        expect(lower).toBeGreaterThanOrEqual(inputs.optimistic - 1e-9);
        expect(upper).toBeLessThanOrEqual(inputs.pessimistic + 1e-9);
        expect(lower).toBeLessThanOrEqual(mean + 1e-9);
        expect(upper).toBeGreaterThanOrEqual(mean - 1e-9);
      }),
    );
  });
});
