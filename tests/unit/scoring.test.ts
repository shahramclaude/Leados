import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { clampScale, rankFindings, scoreFinding } from "@/lib/domain/scoring";

const scale = fc.integer({ min: 1, max: 10 });

describe("scoring", () => {
  it("score is always positive for in-range inputs", () => {
    fc.assert(
      fc.property(scale, scale, scale, (impact, confidence, effort) => {
        expect(scoreFinding({ impact, confidence, effort })).toBeGreaterThan(0);
      }),
    );
  });

  it("increasing impact never decreases the score, holding confidence/effort fixed", () => {
    fc.assert(
      fc.property(scale, scale, fc.integer({ min: 1, max: 9 }), (confidence, effort, impact) => {
        const lower = scoreFinding({ impact, confidence, effort });
        const higher = scoreFinding({ impact: impact + 1, confidence, effort });
        expect(higher).toBeGreaterThanOrEqual(lower);
      }),
    );
  });

  it("increasing effort never increases the score, holding impact/confidence fixed", () => {
    fc.assert(
      fc.property(scale, scale, fc.integer({ min: 1, max: 9 }), (impact, confidence, effort) => {
        const lower = scoreFinding({ impact, confidence, effort: effort + 1 });
        const higher = scoreFinding({ impact, confidence, effort });
        expect(higher).toBeGreaterThanOrEqual(lower);
      }),
    );
  });

  it("clampScale clamps to [1, 10]", () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true }), (value) => {
        const clamped = clampScale(value);
        expect(clamped).toBeGreaterThanOrEqual(1);
        expect(clamped).toBeLessThanOrEqual(10);
      }),
    );
  });

  it("rankFindings sorts descending by score and preserves all items", () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 0, max: 1000, noNaN: true }), { minLength: 0, maxLength: 50 }), (scores) => {
        const items = scores.map((score, id) => ({ id, score }));
        const ranked = rankFindings(items);
        expect(ranked).toHaveLength(items.length);
        for (let i = 1; i < ranked.length; i++) {
          expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
        }
      }),
    );
  });
});
