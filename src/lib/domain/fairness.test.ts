import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  demographicParityDifference,
  demographicParityRatio,
  equalizedOddsDifference,
  type GroupOutcomes,
  type GroupConfusion,
} from "./fairness";
import { arbGroupOutcomes } from "../../../tests/fixtures/generators";

describe("fairness — example-based", () => {
  it("is zero when all groups have identical rates", () => {
    const groups: GroupOutcomes[] = [
      { group: "A", positives: 50, total: 100 },
      { group: "B", positives: 25, total: 50 },
    ];
    expect(demographicParityDifference(groups)).toBeCloseTo(0);
    expect(demographicParityRatio(groups)).toBeCloseTo(1);
  });

  it("reports maximal disparity when one group has 0% and another 100%", () => {
    const groups: GroupOutcomes[] = [
      { group: "A", positives: 0, total: 50 },
      { group: "B", positives: 50, total: 50 },
    ];
    expect(demographicParityDifference(groups)).toBeCloseTo(1);
    expect(demographicParityRatio(groups)).toBeCloseTo(0);
  });

  it("rejects impossible counts (positives > total)", () => {
    expect(() =>
      demographicParityDifference([{ group: "A", positives: 10, total: 5 }]),
    ).toThrow();
  });

  it("equalized odds difference is zero when TPRs match across groups", () => {
    const groups: GroupConfusion[] = [
      { group: "A", positives: 40, total: 100, truePositives: 30, actualPositives: 50 },
      { group: "B", positives: 20, total: 50, truePositives: 15, actualPositives: 25 },
    ];
    expect(equalizedOddsDifference(groups)).toBeCloseTo(0);
  });
});

describe("fairness — property-based", () => {
  it("demographic parity difference is always in [0, 1]", () => {
    fc.assert(
      fc.property(arbGroupOutcomes, (groups) => {
        const diff = demographicParityDifference(groups);
        expect(diff).toBeGreaterThanOrEqual(0);
        expect(diff).toBeLessThanOrEqual(1);
      }),
    );
  });

  it("demographic parity ratio is always in [0, 1]", () => {
    fc.assert(
      fc.property(arbGroupOutcomes, (groups) => {
        const ratio = demographicParityRatio(groups);
        expect(ratio).toBeGreaterThanOrEqual(0);
        expect(ratio).toBeLessThanOrEqual(1);
      }),
    );
  });

  it("is symmetric under reordering of groups", () => {
    fc.assert(
      fc.property(arbGroupOutcomes, (groups) => {
        const shuffled = [...groups].reverse();
        expect(demographicParityDifference(shuffled)).toBeCloseTo(
          demographicParityDifference(groups),
          10,
        );
        expect(demographicParityRatio(shuffled)).toBeCloseTo(
          demographicParityRatio(groups),
          10,
        );
      }),
    );
  });

  it("is invariant to duplicating a group (scale-invariance of rates)", () => {
    fc.assert(
      fc.property(arbGroupOutcomes, (groups) => {
        const doubled = groups.flatMap((g) => [g, { ...g }]);
        expect(demographicParityDifference(doubled)).toBeCloseTo(
          demographicParityDifference(groups),
          10,
        );
      }),
    );
  });

  it("collapses to zero disparity for a single group, regardless of counts", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }).chain((total) =>
          fc.integer({ min: 0, max: total }).map((positives) => ({
            group: "only",
            total,
            positives,
          })),
        ),
        (group) => {
          expect(demographicParityDifference([group])).toBe(0);
          expect(demographicParityRatio([group])).toBe(1);
        },
      ),
    );
  });
});
