import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  decisionCognitiveWeight,
  REVERSIBILITY_MULTIPLIER,
  type DQScale,
  type ReversibilityClass,
} from "@/lib/cognitiveLoad";
import { computeFatigueProxy, type RatedDecisionPoint } from "@/lib/fatigue";
import { decisionWindowSuggestion, summarizeDailyLoad } from "@/lib/leaderState/decisionLoad";
import type { DecisionRecord } from "@/lib/leaderState/types";

const dqScaleArb = fc.constantFrom<DQScale>(1, 2, 3, 4, 5);
const reversibilityArb = fc.constantFrom<ReversibilityClass>("reversible", "costly-to-reverse", "irreversible");

function makeDecision(overrides: Partial<DecisionRecord>): DecisionRecord {
  return {
    id: overrides.id ?? "dec-1",
    ownerUserId: "owner",
    decidedAt: overrides.decidedAt ?? new Date("2026-01-05T09:00:00"),
    category: "uncategorized",
    stakes: 3,
    timePressure: 3,
    informationCompleteness: 3,
    clarity: 3,
    reversibility: "reversible",
    selfRatedQuality: null,
    notes: null,
    createdAt: new Date("2026-01-05T09:00:00"),
    ...overrides,
  };
}

describe("decisionCognitiveWeight — property tests", () => {
  it("is always non-negative", () => {
    fc.assert(
      fc.property(dqScaleArb, dqScaleArb, dqScaleArb, dqScaleArb, reversibilityArb, (stakes, tp, info, clarity, rev) => {
        const w = decisionCognitiveWeight({ stakes, timePressure: tp, informationCompleteness: info, clarity }, rev);
        expect(w).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it("is monotonically non-decreasing in stakes, holding everything else fixed", () => {
    fc.assert(
      fc.property(dqScaleArb, dqScaleArb, dqScaleArb, reversibilityArb, (tp, info, clarity, rev) => {
        const weights = ([1, 2, 3, 4, 5] as DQScale[]).map((stakes) =>
          decisionCognitiveWeight({ stakes, timePressure: tp, informationCompleteness: info, clarity }, rev),
        );
        for (let i = 1; i < weights.length; i++) {
          expect(weights[i]).toBeGreaterThanOrEqual(weights[i - 1] - 1e-9);
        }
      }),
    );
  });

  it("irreversible always weighs at least as much as reversible, all else equal", () => {
    fc.assert(
      fc.property(dqScaleArb, dqScaleArb, dqScaleArb, dqScaleArb, (stakes, tp, info, clarity) => {
        const dims = { stakes, timePressure: tp, informationCompleteness: info, clarity };
        const reversible = decisionCognitiveWeight(dims, "reversible");
        const irreversible = decisionCognitiveWeight(dims, "irreversible");
        expect(irreversible).toBeGreaterThanOrEqual(reversible);
      }),
    );
  });

  it("respects the documented reversibility multiplier ratio, within rounding tolerance", () => {
    fc.assert(
      fc.property(dqScaleArb, dqScaleArb, dqScaleArb, dqScaleArb, (stakes, tp, info, clarity) => {
        const dims = { stakes, timePressure: tp, informationCompleteness: info, clarity };
        const reversible = decisionCognitiveWeight(dims, "reversible");
        const irreversible = decisionCognitiveWeight(dims, "irreversible");
        // Both values are independently rounded to 2 decimal places, so allow
        // a small absolute tolerance rather than demanding an exact ratio.
        const expectedIrreversible =
          reversible * (REVERSIBILITY_MULTIPLIER.irreversible / REVERSIBILITY_MULTIPLIER.reversible);
        expect(Math.abs(irreversible - expectedIrreversible)).toBeLessThanOrEqual(0.03);
      }),
    );
  });
});

describe("computeFatigueProxy — fixtures, seeded histories", () => {
  it("reports insufficient-data with a tiny sample", () => {
    const points: RatedDecisionPoint[] = [
      { hourOfDay: 9, selfRatedQuality: 5 },
      { hourOfDay: 15, selfRatedQuality: 3 },
    ];
    const result = computeFatigueProxy(points);
    expect(result.confidence).toBe("insufficient-data");
    expect(result.lowestQualityBucket).toBeNull();
  });

  it("finds a lower afternoon bucket in a seeded history skewed that way", () => {
    const points: RatedDecisionPoint[] = [];
    // Mornings: consistently high self-rated quality.
    for (let i = 0; i < 6; i++) points.push({ hourOfDay: 9, selfRatedQuality: 5 });
    // Afternoons: consistently low self-rated quality.
    for (let i = 0; i < 6; i++) points.push({ hourOfDay: 15, selfRatedQuality: 2 });

    const result = computeFatigueProxy(points);
    expect(result.lowestQualityBucket).toBe("afternoon");
    expect(result.confidence).not.toBe("insufficient-data");
  });

  it("every bucket result carries its own sample size (no hidden small-n claims)", () => {
    const points: RatedDecisionPoint[] = [
      { hourOfDay: 9, selfRatedQuality: 4 },
      { hourOfDay: 9, selfRatedQuality: 5 },
      { hourOfDay: 9, selfRatedQuality: 3 },
    ];
    const result = computeFatigueProxy(points);
    for (const b of result.buckets) {
      expect(typeof b.sampleSize).toBe("number");
    }
  });
});

describe("decisionWindowSuggestion — fixtures", () => {
  it("returns insufficient-data when there are no rated high-stakes decisions", () => {
    const decisions = [makeDecision({ stakes: 2, reversibility: "reversible", selfRatedQuality: null })];
    const result = decisionWindowSuggestion(decisions);
    expect(result.confidence).toBe("insufficient-data");
    expect(result.bucket).toBeNull();
  });

  it("surfaces the morning window when seeded high-stakes decisions rate best there", () => {
    const decisions: DecisionRecord[] = [];
    for (let i = 0; i < 4; i++) {
      decisions.push(
        makeDecision({
          id: `morning-${i}`,
          decidedAt: new Date(`2026-01-0${i + 1}T09:00:00`),
          stakes: 5,
          reversibility: "irreversible",
          selfRatedQuality: 5,
        }),
      );
    }
    for (let i = 0; i < 4; i++) {
      decisions.push(
        makeDecision({
          id: `evening-${i}`,
          decidedAt: new Date(`2026-01-0${i + 1}T19:00:00`),
          stakes: 5,
          reversibility: "irreversible",
          selfRatedQuality: 2,
        }),
      );
    }
    const result = decisionWindowSuggestion(decisions);
    expect(result.bucket).toBe("morning");
    expect(result.statement).toMatch(/suggestion/i);
    expect(result.statement).not.toMatch(/\bshould\b/i);
  });
});

describe("summarizeDailyLoad — fixtures", () => {
  it("combines decision weight with meeting-load factor per day", () => {
    const decisions = [
      makeDecision({ id: "a", decidedAt: new Date("2026-02-01T09:00:00"), stakes: 5, reversibility: "irreversible" }),
    ];
    const recovery = [
      {
        id: "r1",
        ownerUserId: "owner",
        date: "2026-02-01",
        deepWorkBlocksPlanned: 2,
        deepWorkBlocksHonored: 1,
        quietHoursKept: true,
        meetingMinutes: 360,
        createdAt: new Date(),
      },
    ];
    const [day] = summarizeDailyLoad(decisions, recovery);
    expect(day.date).toBe("2026-02-01");
    expect(day.decisionCount).toBe(1);
    expect(day.meetingLoadFactor).toBeCloseTo(1, 5);
    expect(day.combinedLoadScore).toBeGreaterThan(day.totalCognitiveWeight);
  });
});
