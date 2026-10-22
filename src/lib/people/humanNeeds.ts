// src/lib/people/humanNeeds.ts
//
// Soft, self-reported, person-owned signals that temper the load balancer and
// team composer so they don't just optimize a spreadsheet. Every field here
// is something the person themselves declares and can change or withdraw —
// never inferred from behavior, never visible to anyone but the person and
// (in aggregate only) their manager for staffing conversations.

export interface HumanNeedsDeclaration {
  personId: string;
  /** Self-declared, e.g. "no more than 2 concurrent workstreams" — a preference, not a rule the system enforces silently. */
  capacityPreference: "light" | "standard" | "stretch";
  /** Days since the person's last declared time off >= 3 consecutive days. Self-reported or HR-system sourced with consent. */
  daysSinceLastBreak: number;
  /** Person opts in to being considered for stretch assignments at all. */
  openToStretch: boolean;
}

export interface SustainabilityFlag {
  personId: string;
  flagged: boolean;
  reason: string | null;
}

const BREAK_RISK_DAYS = 120;

/**
 * Flags a *conversation*, not a verdict: when someone has declared they want
 * a lighter load (or hasn't had a break in a long time) AND their measured
 * cognitive load is elevated, this raises a flag for a human (the person or
 * their manager, scoped per PeopleScope) to look at — it never changes
 * anyone's assignments on its own.
 */
export function sustainabilityFlag(declaration: HumanNeedsDeclaration, loadScore: number): SustainabilityFlag {
  const reasons: string[] = [];
  if (declaration.capacityPreference === "light" && loadScore >= 40) {
    reasons.push("declared a light-capacity preference but current load is elevated or above");
  }
  if (declaration.daysSinceLastBreak >= BREAK_RISK_DAYS && loadScore >= 60) {
    reasons.push(`no break in ${declaration.daysSinceLastBreak} days alongside high measured load`);
  }
  return { personId: declaration.personId, flagged: reasons.length > 0, reason: reasons.length > 0 ? reasons.join("; ") : null };
}
