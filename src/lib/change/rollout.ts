import { rngFromKey, shuffle } from "@/lib/prng";
import type { SteppedWedgeAssignment, TwoArmAssignment } from "./types";

/**
 * Deterministic rollout/randomization utilities (Phase 3c). All assignment
 * is seeded from a stable key (program id + intervention id) via
 * `src/lib/prng.ts`, so the same inputs always reproduce the same design —
 * required for auditability and for re-deriving "what was planned" later.
 */

/**
 * Stepped-wedge design: every affected group eventually gets the
 * intervention, but the order (which period each group "crosses over" from
 * control to treatment) is randomized. Appropriate when withholding an
 * intervention from some groups indefinitely is not acceptable for an org
 * change, but a staggered rollout is.
 */
export function assignSteppedWedge(
  groupIds: readonly string[],
  periods: number,
  seedKey: string
): SteppedWedgeAssignment {
  if (periods < 2) throw new Error("stepped-wedge design requires at least 2 periods");
  const rng = rngFromKey(seedKey);
  const order = shuffle(groupIds, rng);
  const crossoverPeriodByGroup: Record<string, number> = {};
  order.forEach((groupId, idx) => {
    // Spread crossovers across periods 0..periods-2 (period periods-1 reserved
    // so every group has at least one post-crossover observation period).
    const period = Math.min(periods - 2, Math.floor((idx / order.length) * (periods - 1)));
    crossoverPeriodByGroup[groupId] = period;
  });
  return { kind: "stepped_wedge", seed: seedKey, periods, crossoverPeriodByGroup };
}

/** Simple two-arm randomized rollout, for interventions that can have a held-out control group. */
export function assignTwoArm(groupIds: readonly string[], seedKey: string, treatmentFraction = 0.5): TwoArmAssignment {
  const rng = rngFromKey(seedKey);
  const shuffled = shuffle(groupIds, rng);
  const splitIndex = Math.round(shuffled.length * treatmentFraction);
  const treatmentGroups = shuffled.slice(0, splitIndex);
  const controlGroups = shuffled.slice(splitIndex);
  return { kind: "two_arm", seed: seedKey, treatmentGroups, controlGroups };
}

export function isExposed(assignment: SteppedWedgeAssignment | import("./types").TwoArmAssignment, groupId: string, period: number): boolean {
  if (assignment.kind === "stepped_wedge") {
    const crossover = assignment.crossoverPeriodByGroup[groupId];
    return crossover !== undefined && period >= crossover;
  }
  return assignment.treatmentGroups.includes(groupId);
}
