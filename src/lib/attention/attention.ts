// Core interrupt policy — the single place that decides whether a given
// candidate notification may break a user's focus ("interrupt"), should be
// batched into the next digest ("digest"), or must be withheld entirely
// ("suppressed", e.g. quiet hours with no override). Every decision carries
// a plain-English `reason` so the UI can always answer
// "you were interrupted because …".

import { db } from "@/db";
import { notificationPreferences } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getCircadianState } from "./circadian";
import { getCognitiveLoad } from "./cognitiveLoad";
import { getBudgetState, spendBudget } from "./budget";
import { getAdaptivePolicy } from "./attentionOpt";

export type AttentionDecisionKind = "interrupt" | "digest" | "suppressed";

export interface AttentionCandidate {
  userId: string;
  domain: string;
  severity: number; // 1-5
}

export interface AttentionDecision {
  decision: AttentionDecisionKind;
  reason: string;
  cognitiveLoad: number;
  fatigue: number;
  budget: { used: number; budget: number; remaining: number };
  adaptive: { interruptSeverityFloor: number; digestIntervalMinutes: number };
}

const SEVERITY_5 = 5;

export async function evaluateAttention(candidate: AttentionCandidate, now: Date = new Date()): Promise<AttentionDecision> {
  const { userId, domain, severity } = candidate;

  const [circadian, load, adaptive, prefRows] = await Promise.all([
    getCircadianState(userId, now),
    getCognitiveLoad(userId, now),
    getAdaptivePolicy(userId, now),
    db
      .select()
      .from(notificationPreferences)
      .where(and(eq(notificationPreferences.userId, userId), eq(notificationPreferences.domain, domain))),
  ]);

  const inAppPref = prefRows.find((p) => p.channel === "in_app");
  const allowInterrupt = inAppPref?.allowInterrupt ?? false;
  const domainEnabled = inAppPref?.enabled ?? true;

  const reasons: string[] = [];

  if (!domainEnabled) {
    reasons.push(`notifications for "${domain}" are disabled in your preferences`);
    return buildResult("suppressed", reasons, load, await getBudgetState(userId, now), adaptive);
  }

  // Quiet hours hard-gate unless severity 5 AND the user has explicitly
  // opted in to interrupts for this domain.
  if (circadian.inQuietHours && !(severity >= SEVERITY_5 && allowInterrupt)) {
    reasons.push(
      `quiet hours are active (ends in ${circadian.minutesUntilQuietHoursEnd}m) and this is not an opted-in severity-5 alert`,
    );
    return buildResult("digest", reasons, load, await getBudgetState(userId, now), adaptive);
  }

  const isMaxSeverityOptIn = severity >= SEVERITY_5 && allowInterrupt;

  if (!isMaxSeverityOptIn) {
    reasons.push(`severity ${severity} is below the interrupt threshold (5, with opt-in required)`);
    return buildResult("digest", reasons, load, await getBudgetState(userId, now), adaptive);
  }

  const budgetState = await getBudgetState(userId, now);
  if (budgetState.remaining <= 0) {
    reasons.push(`daily interrupt budget exhausted (${budgetState.used}/${budgetState.budget} used)`);
    return buildResult("digest", reasons, load, budgetState, adaptive);
  }

  // Even severity-5 opt-ins back off if cognitive load is extreme, unless
  // the candidate is the only thing in flight (load naturally recalculated
  // live, so this mostly protects against interrupt storms).
  if (load.score >= 92) {
    reasons.push(`cognitive load is critical (${load.score}/100) — deferring even severity-5 alert to digest`);
    return buildResult("digest", reasons, load, budgetState, adaptive);
  }

  const spent = await spendBudget(userId, now);
  reasons.push(`severity 5 with opt-in for "${domain}"`);
  reasons.push(`quiet hours: ${circadian.inQuietHours ? "active but overridden by opt-in" : "not active"}`);
  reasons.push(`cognitive load ${load.score}/100 — within interrupt tolerance`);
  reasons.push(`interrupt budget ${spent.used}/${spent.budget} used today`);

  return buildResult("interrupt", reasons, load, spent, adaptive);
}

function buildResult(
  decision: AttentionDecisionKind,
  reasons: string[],
  load: Awaited<ReturnType<typeof getCognitiveLoad>>,
  budget: Awaited<ReturnType<typeof getBudgetState>>,
  adaptive: Awaited<ReturnType<typeof getAdaptivePolicy>>,
): AttentionDecision {
  return {
    decision,
    reason: reasons.join("; "),
    cognitiveLoad: load.score,
    fatigue: load.fatigue,
    budget: { used: budget.used, budget: budget.budget, remaining: budget.remaining },
    adaptive: {
      interruptSeverityFloor: adaptive.interruptSeverityFloor,
      digestIntervalMinutes: adaptive.digestIntervalMinutes,
    },
  };
}
