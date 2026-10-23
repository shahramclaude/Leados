// LEADOS — Part 56: Risk-tier mapping (Part 10 action tiers -> regulatory-style tiers)
//
// Honesty note: this mapping is LEADOS's own internal convention. It borrows
// the shape of external AI-risk frameworks (minimal/limited/high/unacceptable
// buckets) for internal communication only. No external certification is
// implied anywhere this type is used.
import type { ActionTier, DecisionRole, RegulatoryTier } from "./types";

export const ACTION_TIER_TO_REGULATORY_TIER: Record<ActionTier, RegulatoryTier> = {
  T0: "minimal",
  T1: "limited",
  T2: "limited",
  T3: "high",
  T4: "high",
};

/** Action tiers at which a fully-automated action (no recommend step) is
 * permitted at all under LEADOS policy. Automating below T3 is not allowed:
 * automation is reserved for cases where the registry/assessment/oversight
 * machinery in this part is guaranteed to be attached. */
const MIN_AUTOMATE_TIER: ActionTier[] = ["T3", "T4"];

export function mapActionTierToRegulatoryTier(tier: ActionTier): RegulatoryTier {
  return ACTION_TIER_TO_REGULATORY_TIER[tier];
}

export interface TierConsistencyIssue {
  code: string;
  message: string;
}

/** Cross-checks a system's declared actionTier / regulatoryTier / decisionRole
 * for internal consistency. Used both by the live registry loader (fail hard
 * on load) and by the standalone consistency test script (Phase 4 gate 5). */
export function checkTierConsistency(input: {
  systemId: string;
  actionTier: ActionTier;
  regulatoryTier: RegulatoryTier;
  decisionRole: DecisionRole;
  requiresHumanReview: boolean;
}): TierConsistencyIssue[] {
  const issues: TierConsistencyIssue[] = [];
  const expectedRegTier = mapActionTierToRegulatoryTier(input.actionTier);

  if (input.regulatoryTier !== expectedRegTier) {
    issues.push({
      code: "tier-map-mismatch",
      message: `${input.systemId}: actionTier ${input.actionTier} maps to regulatoryTier "${expectedRegTier}" but registry declares "${input.regulatoryTier}".`,
    });
  }

  if (input.decisionRole === "automate" && !MIN_AUTOMATE_TIER.includes(input.actionTier)) {
    issues.push({
      code: "automate-below-floor",
      message: `${input.systemId}: decisionRole "automate" is declared at ${input.actionTier}, below the minimum automation floor (T3). Automation at this tier is not permitted by LEADOS policy.`,
    });
  }

  if (input.decisionRole === "automate" && input.actionTier === "T4" && !input.requiresHumanReview) {
    issues.push({
      code: "t4-missing-human-review",
      message: `${input.systemId}: T4 automated system must set requiresHumanReview=true (mandatory pre/post-action human sign-off).`,
    });
  }

  if (input.regulatoryTier === "unacceptable") {
    issues.push({
      code: "unacceptable-tier-present",
      message: `${input.systemId}: regulatoryTier "unacceptable" must never be live in the registry — such a system must be withdrawn, not shipped.`,
    });
  }

  return issues;
}
