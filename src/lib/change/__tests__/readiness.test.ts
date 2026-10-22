import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { readinessScore, readinessActions } from "../readiness";

describe("readinessScore", () => {
  it("is monotone non-decreasing in trainingCompletionRate (property test)", () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0), max: Math.fround(0.8), noNaN: true }),
        fc.float({ min: Math.fround(0), max: Math.fround(0.19), noNaN: true }),
        fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
        fc.integer({ min: 0, max: 5 }),
        (base, bump, capacityHeadroom, priorChangeLoad) => {
          const lower = readinessScore({ trainingCompletionRate: base, capacityHeadroom, priorChangeLoad }).value;
          const higher = readinessScore({
            trainingCompletionRate: base + bump,
            capacityHeadroom,
            priorChangeLoad,
          }).value;
          expect(higher).toBeGreaterThanOrEqual(lower - 1e-9);
        }
      )
    );
  });

  it("is monotone non-decreasing in capacityHeadroom", () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
        fc.float({ min: Math.fround(0), max: Math.fround(0.8), noNaN: true }),
        fc.float({ min: Math.fround(0), max: Math.fround(0.19), noNaN: true }),
        fc.integer({ min: 0, max: 5 }),
        (trainingCompletionRate, base, bump, priorChangeLoad) => {
          const lower = readinessScore({ trainingCompletionRate, capacityHeadroom: base, priorChangeLoad }).value;
          const higher = readinessScore({
            trainingCompletionRate,
            capacityHeadroom: base + bump,
            priorChangeLoad,
          }).value;
          expect(higher).toBeGreaterThanOrEqual(lower - 1e-9);
        }
      )
    );
  });

  it("is monotone non-increasing in priorChangeLoad", () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
        fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
        fc.integer({ min: 0, max: 8 }),
        fc.integer({ min: 0, max: 4 }),
        (trainingCompletionRate, capacityHeadroom, base, extra) => {
          const lower = readinessScore({ trainingCompletionRate, capacityHeadroom, priorChangeLoad: base + extra }).value;
          const higher = readinessScore({ trainingCompletionRate, capacityHeadroom, priorChangeLoad: base }).value;
          expect(higher).toBeGreaterThanOrEqual(lower - 1e-9);
        }
      )
    );
  });

  it("always stays within [0,1]", () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(-2), max: Math.fround(2), noNaN: true }),
        fc.float({ min: Math.fround(-2), max: Math.fround(2), noNaN: true }),
        fc.integer({ min: -5, max: 20 }),
        (trainingCompletionRate, capacityHeadroom, priorChangeLoad) => {
          const { value } = readinessScore({ trainingCompletionRate, capacityHeadroom, priorChangeLoad });
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      )
    );
  });

  it("every Explain envelope carries method, inputs and caveats", () => {
    const result = readinessScore({ trainingCompletionRate: 0.6, capacityHeadroom: 0.4, priorChangeLoad: 1 });
    expect(result.method).toBeTruthy();
    expect(result.caveats.length).toBeGreaterThan(0);
    expect(result.inputs.trainingCompletionRate).toBeCloseTo(0.6);
  });
});

describe("readinessActions", () => {
  it("never suggests a negative gain as the top recommendation", () => {
    const actions = readinessActions({ trainingCompletionRate: 0.5, capacityHeadroom: 0.5, priorChangeLoad: 2 });
    expect(actions[0].estimatedScoreGain).toBeGreaterThanOrEqual(0);
  });

  it("omits the load-reduction lever when there is no concurrent load", () => {
    const actions = readinessActions({ trainingCompletionRate: 0.5, capacityHeadroom: 0.5, priorChangeLoad: 0 });
    expect(actions.find((a) => a.lever === "priorChangeLoad")).toBeUndefined();
  });
});
