// LEADOS — Part 37: jurisdiction scoping for the obligations tracker (extends Part 29).
//
// Part 29's obligations tracker source is not present in this repository snapshot, so this
// module defines the jurisdiction-tagging/applicability contract this part needs and applies it
// against the `obligations` table added here. If/when Part 29's actual tracker tables are
// merged, `isObligationApplicable` is the function to re-point at them.

import type { ConsolidationMethod, EntityRecord } from "./types";

export interface ApplicabilityRule {
  jurisdictionCodes?: string[];
  regions?: string[];
  consolidationMethods?: ConsolidationMethod[];
  minOwnershipPct?: number;
}

export interface ObligationDefinition {
  code: string;
  title: string;
  description: string;
  jurisdictionCode: string; // ISO-3166-1 alpha-2, or "*" for globally applicable
  applicabilityRule: ApplicabilityRule;
  frequency: "monthly" | "quarterly" | "annual" | "one-off";
  dataClass: string;
}

/** Returns true if `obligation` applies to `entity`. Jurisdiction is matched first (obligation's
 * own `jurisdictionCode`, "*" = global), then the finer-grained `applicabilityRule` is evaluated.
 * All rule clauses are AND'd — omitting a clause means "no constraint on that dimension", never
 * "constraint satisfied by default silently ignoring the field". */
export function isObligationApplicable(obligation: ObligationDefinition, entity: EntityRecord): boolean {
  if (obligation.jurisdictionCode !== "*" && obligation.jurisdictionCode !== entity.jurisdictionCode) {
    return false;
  }
  const rule = obligation.applicabilityRule ?? {};
  if (rule.jurisdictionCodes && !rule.jurisdictionCodes.includes(entity.jurisdictionCode)) return false;
  if (rule.regions && !rule.regions.includes(entity.region)) return false;
  if (rule.consolidationMethods && !rule.consolidationMethods.includes(entity.consolidationMethod)) return false;
  if (rule.minOwnershipPct !== undefined && entity.ownershipPct < rule.minOwnershipPct) return false;
  return true;
}

export function applicableObligations(obligations: ObligationDefinition[], entity: EntityRecord): ObligationDefinition[] {
  return obligations.filter((o) => isObligationApplicable(o, entity));
}
