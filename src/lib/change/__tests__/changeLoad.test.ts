import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { changeLoadIndex, saturationFindings, DEFAULT_SATURATION_THRESHOLD } from "../changeLoad";
import type { ChangeProgram } from "../types";

function makeProgram(id: string, groups: string[], loadWeight: number, startDate = "2025-01-01"): ChangeProgram {
  return {
    id,
    intent: id,
    targetBehaviors: [],
    affectedGroups: groups,
    resistanceMap: [],
    status: "active",
    startDate,
    loadWeight,
  };
}

describe("changeLoadIndex", () => {
  it("is additive: load from the union of two disjoint program sets equals the sum of each alone", () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ min: Math.fround(0.1), max: Math.fround(2), noNaN: true }), { minLength: 1, maxLength: 5 }),
        fc.array(fc.float({ min: Math.fround(0.1), max: Math.fround(2), noNaN: true }), { minLength: 1, maxLength: 5 }),
        (weightsA, weightsB) => {
          const now = new Date("2025-06-01");
          const programsA = weightsA.map((w, i) => makeProgram(`a${i}`, ["g1"], w));
          const programsB = weightsB.map((w, i) => makeProgram(`b${i}`, ["g1"], w));

          const loadA = changeLoadIndex("g1", programsA, now).value;
          const loadB = changeLoadIndex("g1", programsB, now).value;
          const loadUnion = changeLoadIndex("g1", [...programsA, ...programsB], now).value;

          // Each index is independently rounded to 2 decimal places for display,
          // so comparing a union of many small values against the sum of two
          // separately-rounded totals can differ by a cent-level rounding
          // artifact; tolerance reflects that, not an additivity violation.
          expect(Math.abs(loadUnion - (loadA + loadB))).toBeLessThanOrEqual(0.03);
        }
      )
    );
  });

  it("ignores completed programs and programs affecting a different group", () => {
    const now = new Date("2025-06-01");
    const programs = [
      makeProgram("done", ["g1"], 5, "2024-01-01"),
      { ...makeProgram("done2", ["g1"], 5, "2024-01-01"), status: "completed" as const },
      makeProgram("other-group", ["g2"], 5),
    ];
    const load = changeLoadIndex("g1", programs, now);
    expect(load.value).toBe(5); // only "done" (still active) counts; "done2" completed and "other-group" irrelevant
  });

  it("does not count a program that has not started yet", () => {
    const now = new Date("2025-01-01");
    const programs = [makeProgram("future", ["g1"], 3, "2030-01-01")];
    expect(changeLoadIndex("g1", programs, now).value).toBe(0);
  });
});

describe("saturationFindings", () => {
  it("fires on a seeded overload scenario (4 concurrent programs on one group)", () => {
    const now = new Date("2025-06-01");
    const programs = [
      makeProgram("p1", ["overloaded"], 1),
      makeProgram("p2", ["overloaded"], 1),
      makeProgram("p3", ["overloaded"], 1),
      makeProgram("p4", ["overloaded"], 1),
      makeProgram("p5", ["calm"], 1),
    ];
    const findings = saturationFindings(["overloaded", "calm"], programs, now, DEFAULT_SATURATION_THRESHOLD);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toContain("overloaded");
    expect(findings[0].title).toContain("4 simultaneous change programs");
    const evidencePrograms = findings[0].evidence.programs as Array<{ id: string }>;
    expect(evidencePrograms.map((p) => p.id).sort()).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("does not fire when load is exactly at threshold", () => {
    const now = new Date("2025-06-01");
    const programs = [makeProgram("p1", ["g1"], 1), makeProgram("p2", ["g1"], 1), makeProgram("p3", ["g1"], 1)];
    const findings = saturationFindings(["g1"], programs, now, 3);
    expect(findings).toHaveLength(0);
  });
});
