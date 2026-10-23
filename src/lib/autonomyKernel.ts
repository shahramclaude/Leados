// Part 10 (stub — source file not present in this snapshot): Autonomy Kernel.
//
// Contract implemented here, inferred from the standing order:
//   - every action class starts at T1 (draft-only, human approves every time).
//   - a class is only promoted to a higher tier via an explicit, audited human
//     decision (`applyPromotion`), never silently by volume alone.
//   - even at T3/T4, the product may only act "as" a specific human if that
//     human has an explicit `delegatedPermissions` grant for the class. Tier
//     is necessary but never sufficient.
//
// This module is pure logic over plain objects so it can be unit-tested
// without a database, and a thin DB-backed wrapper lives in
// `src/lib/db/autonomyKernelService.ts`.

import type { AutonomyTier } from "./types";

export type ActionClass = {
  id: string;
  key: string;
  label: string;
  tier: AutonomyTier;
  successCount: number;
  totalCount: number;
  promotionHistory: PromotionRecord[];
};

export type PromotionRecord = {
  fromTier: AutonomyTier;
  toTier: AutonomyTier;
  decidedBy: string;
  decidedAt: string;
  reason: string;
};

export type DelegatedPermission = {
  personId: string;
  actionClassKey: string;
  grant: "none" | "draft" | "auto_with_notify" | "auto_silent";
  grantedBy: string;
  expiresAt: string | null;
};

const TIER_ORDER: AutonomyTier[] = ["T1", "T2", "T3", "T4"];

export function tierRank(tier: AutonomyTier): number {
  return TIER_ORDER.indexOf(tier);
}

/** Promotion is only ever a *recommendation* — never applied automatically. */
export function recommendPromotion(
  cls: ActionClass,
  opts: { minSamples?: number; minApprovalRate?: number } = {},
): { recommend: boolean; reason: string } {
  const minSamples = opts.minSamples ?? 20;
  const minApprovalRate = opts.minApprovalRate ?? 0.9;
  if (cls.tier === "T4") return { recommend: false, reason: "already at ceiling tier T4" };
  if (cls.totalCount < minSamples) {
    return {
      recommend: false,
      reason: `only ${cls.totalCount}/${minSamples} samples observed`,
    };
  }
  const rate = cls.successCount / cls.totalCount;
  if (rate < minApprovalRate) {
    return {
      recommend: false,
      reason: `approval rate ${(rate * 100).toFixed(1)}% below ${(minApprovalRate * 100).toFixed(0)}% threshold`,
    };
  }
  return {
    recommend: true,
    reason: `approval rate ${(rate * 100).toFixed(1)}% over ${cls.totalCount} samples meets threshold`,
  };
}

/** The only legitimate way a class's tier changes: a named human decides it, audited. */
export function applyPromotion(
  cls: ActionClass,
  decidedBy: string,
  reason: string,
): ActionClass {
  const currentRank = tierRank(cls.tier);
  const nextTier = TIER_ORDER[Math.min(currentRank + 1, TIER_ORDER.length - 1)];
  const record: PromotionRecord = {
    fromTier: cls.tier,
    toTier: nextTier,
    decidedBy,
    decidedAt: new Date().toISOString(),
    reason,
  };
  return {
    ...cls,
    tier: nextTier,
    promotionHistory: [...cls.promotionHistory, record],
  };
}

/**
 * Can the system send `actionClassKey` on behalf of `personId` without a
 * human tapping "send" first? Requires BOTH:
 *   1. the class tier being T3+ (earned via audited promotion), AND
 *   2. an explicit, unexpired delegation grant from that specific person.
 * Absent either, the result is always a draft (T1 behaviour) — this is the
 * "never assumed, never speaks for a human without explicit delegation" rule.
 */
export function canAutoSend(
  cls: ActionClass,
  grant: DelegatedPermission | undefined,
  now: Date = new Date(),
): { allowed: boolean; reason: string } {
  if (tierRank(cls.tier) < tierRank("T3")) {
    return { allowed: false, reason: `action class '${cls.key}' is ${cls.tier}, below auto-send floor T3` };
  }
  if (!grant || grant.grant === "none") {
    return { allowed: false, reason: "no explicit delegation grant from this person for this action class" };
  }
  if (grant.expiresAt && new Date(grant.expiresAt).getTime() < now.getTime()) {
    return { allowed: false, reason: "delegation grant expired" };
  }
  if (grant.grant === "draft") {
    return { allowed: false, reason: "grant is draft-only (human must tap send)" };
  }
  return { allowed: true, reason: `grant '${grant.grant}' active for class at tier ${cls.tier}` };
}

export function defaultActionClasses(): Omit<ActionClass, "id">[] {
  return [
    { key: "nudge.commitment_due", label: "Nudge: commitment approaching/overdue", tier: "T1", successCount: 0, totalCount: 0, promotionHistory: [] },
    { key: "nudge.delegation_checkin", label: "Nudge: delegation needs a check-in", tier: "T1", successCount: 0, totalCount: 0, promotionHistory: [] },
    { key: "agenda.decision_stagnating", label: "Agenda item: stagnating decision", tier: "T1", successCount: 0, totalCount: 0, promotionHistory: [] },
    { key: "task.meeting_no_actions", label: "Task: backfill meeting with no actions", tier: "T1", successCount: 0, totalCount: 0, promotionHistory: [] },
    { key: "email.metric_drifting", label: "Email: metric drifting from target", tier: "T1", successCount: 0, totalCount: 0, promotionHistory: [] },
    { key: "digest.batched_nudges", label: "Digest: batched low-stakes nudges", tier: "T1", successCount: 0, totalCount: 0, promotionHistory: [] },
  ];
}
