// Human-Impact Ledger (Part 54 mandatory ledger).
//
// This module is deliberately NOT optimisable away. A simulation that
// produces zero human-impact entries for a move touching people, or that
// leaves a "high"/"severe" disruption without a linked support plan, is an
// invalid simulation — see assertHumanImpactComplete, enforced in the API
// route and covered by a verify-script gate.

import type { StructuralMoveType, DisruptionClass, RoleChangeType, HumanImpactLedgerEntry, HumanImpactSummary } from "./types";

export type PersonLike = {
  id: number;
  name: string;
  unitId: number;
  isManager: boolean;
  tenureMonths: number;
};

export type SupportPlanLike = { id: number; name: string; appliesTo: DisruptionClass[] };

const DISRUPTION_RANK: Record<DisruptionClass, number> = { none: 0, low: 1, moderate: 2, high: 3, severe: 4 };

export function classifyPerson(
  moveType: StructuralMoveType,
  person: PersonLike,
  context: { isPrimaryUnit: boolean },
): { roleChangeType: RoleChangeType; disruptionClass: DisruptionClass; rationale: string } {
  switch (moveType) {
    case "merge":
      if (person.isManager && !context.isPrimaryUnit) {
        return {
          roleChangeType: "redundancy_risk",
          disruptionClass: "severe",
          rationale: "Manager of a non-primary unit in a merge: duplicate leadership layer created by the merge.",
        };
      }
      if (person.isManager) {
        return {
          roleChangeType: "title_change",
          disruptionClass: "moderate",
          rationale: "Manager of the primary (surviving) unit: scope changes as merged teams report in.",
        };
      }
      return {
        roleChangeType: "lateral_move",
        disruptionClass: "moderate",
        rationale: "Individual contributor absorbed into the merged unit: new teammates, processes, possibly new manager.",
      };
    case "split":
      if (person.isManager) {
        return {
          roleChangeType: "promotion",
          disruptionClass: "low",
          rationale: "Manager of a unit being split: likely to lead one of the resulting smaller units.",
        };
      }
      return {
        roleChangeType: "lateral_move",
        disruptionClass: "low",
        rationale: "Reassigned to one of the resulting split units; same work, smaller unit.",
      };
    case "reporting_line_change":
      return {
        roleChangeType: "manager_change",
        disruptionClass: person.isManager ? "moderate" : "moderate",
        rationale: "Unit's reporting line changes; new manager relationship up the chain.",
      };
    case "centralize":
      if (context.isPrimaryUnit) {
        return {
          roleChangeType: "none",
          disruptionClass: "low",
          rationale: "Hub unit gains coordination load but role is unchanged.",
        };
      }
      if (person.isManager) {
        return {
          roleChangeType: "redundancy_risk",
          disruptionClass: "high",
          rationale: "Manager of a unit losing decision rights to the centralised hub.",
        };
      }
      return {
        roleChangeType: "lateral_move",
        disruptionClass: "low",
        rationale: "Day-to-day work largely unchanged; decisions now routed through the hub.",
      };
    case "decentralize":
      if (context.isPrimaryUnit && person.isManager) {
        return {
          roleChangeType: "redundancy_risk",
          disruptionClass: "moderate",
          rationale: "Hub manager's centralised authority is distributed out to peer units.",
        };
      }
      return {
        roleChangeType: "lateral_move",
        disruptionClass: "low",
        rationale: "Gains more local decision authority as the hub decentralises.",
      };
  }
}

export function pickSupportPlan(disruptionClass: DisruptionClass, plans: SupportPlanLike[]): SupportPlanLike | null {
  if (disruptionClass === "none") return null;
  const candidates = plans.filter((p) => p.appliesTo.includes(disruptionClass));
  if (candidates.length === 0) return plans[0] ?? null;
  return candidates[0];
}

export function buildHumanImpactLedger(
  moveType: StructuralMoveType,
  affectedUnitIds: number[],
  primaryUnitId: number | null,
  people: PersonLike[],
  plans: SupportPlanLike[],
): HumanImpactLedgerEntry[] {
  const affectedSet = new Set(affectedUnitIds);
  const affectedPeople = people.filter((p) => affectedSet.has(p.unitId));

  return affectedPeople.map((person) => {
    const isPrimaryUnit = primaryUnitId != null && person.unitId === primaryUnitId;
    const { roleChangeType, disruptionClass, rationale } = classifyPerson(moveType, person, { isPrimaryUnit });
    const plan = pickSupportPlan(disruptionClass, plans);
    return {
      personId: person.id,
      personName: person.name,
      unitId: person.unitId,
      roleChangeType,
      disruptionClass,
      supportPlanId: plan?.id ?? null,
      supportPlanName: plan?.name ?? null,
      rationale,
    };
  });
}

export function summarizeHumanImpact(entries: HumanImpactLedgerEntry[]): HumanImpactSummary {
  const byDisruptionClass: Record<DisruptionClass, number> = { none: 0, low: 0, moderate: 0, high: 0, severe: 0 };
  const byRoleChangeType: Record<RoleChangeType, number> = {
    none: 0,
    title_change: 0,
    manager_change: 0,
    relocation: 0,
    redundancy_risk: 0,
    promotion: 0,
    lateral_move: 0,
  };
  let unsupportedSevereOrHigh = 0;

  for (const e of entries) {
    byDisruptionClass[e.disruptionClass]++;
    byRoleChangeType[e.roleChangeType]++;
    if (DISRUPTION_RANK[e.disruptionClass] >= DISRUPTION_RANK.high && !e.supportPlanId) {
      unsupportedSevereOrHigh++;
    }
  }

  return {
    totalAffected: entries.length,
    byDisruptionClass,
    byRoleChangeType,
    unsupportedSevereOrHigh,
  };
}

/**
 * Enforcement gate: throws if the ledger is missing for a move that touches
 * people, or if any high/severe disruption lacks a support plan. This must
 * be called on every simulation path — a simulation cannot be "completed"
 * without it. This is intentionally not configurable to "optimize it away".
 */
export function assertHumanImpactComplete(peopleAffectedCount: number, summary: HumanImpactSummary) {
  if (peopleAffectedCount > 0 && summary.totalAffected === 0) {
    throw new Error(
      "Human-impact ledger missing: the move affects units with people but produced zero ledger entries. Simulation rejected.",
    );
  }
  if (summary.unsupportedSevereOrHigh > 0) {
    throw new Error(
      `Human-impact ledger incomplete: ${summary.unsupportedSevereOrHigh} high/severe disruption entries have no linked support plan. Simulation rejected.`,
    );
  }
}
