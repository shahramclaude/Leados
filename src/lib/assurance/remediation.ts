// LEADOS — Part 38: tiered, audited, reversible remediation.
//
// Tiers (Phase 1):
//   safe_auto_fix — rebuild a projection / refresh a cache / re-run a failed
//                   check. Always reversible (re-running something has no
//                   lasting side effect to revert, so "reversible=true" with
//                   a no-op revert) and capped per Phase 5 anti-thrash rule.
//   degrade       — turn off a drifting feature flag with a user-visible
//                   notice. Reversible via restoreFlag(). Audited.
//   escalate      — raise a Finding + notification (Part 14). Not itself a
//                   system mutation, so "reversible" means "the finding can
//                   be marked resolved", which is modeled as reversible=true.
//
// ANTI-THRASH CAP (Phase 5 answer #2): a given check may not receive more
// than MAX_AUTO_FIXES_PER_WINDOW safe_auto_fix attempts within
// AUTO_FIX_WINDOW_MS. Once the cap is hit, the system stops auto-fixing and
// escalates instead — this prevents fix→break→fix loops from running
// forever and turns them into a visible Finding after a bounded number of
// attempts.

import { db } from "@/db";
import { remediationActions } from "@/db/schema";
import { and, eq, gte } from "drizzle-orm";
import type { Check } from "@/lib/assurance/registry";
import { appendAudit } from "@/lib/audit";
import { degradeFlag } from "@/lib/featureFlags";
import { escalate, notify } from "@/lib/notifications";

export const MAX_AUTO_FIXES_PER_WINDOW = 3;
export const AUTO_FIX_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface RemediationOutcome {
  tier: "safe_auto_fix" | "degrade" | "escalate";
  actionId: number;
  status: string;
  capped: boolean;
  detail: string;
}

async function countRecentAutoFixes(checkId: string): Promise<number> {
  const since = new Date(Date.now() - AUTO_FIX_WINDOW_MS);
  const rows = await db
    .select()
    .from(remediationActions)
    .where(
      and(
        eq(remediationActions.checkId, checkId),
        eq(remediationActions.tier, "safe_auto_fix"),
        gte(remediationActions.createdAt, since),
      ),
    );
  return rows.length;
}

async function recordAction(input: {
  checkId: string;
  runId?: number;
  tier: "safe_auto_fix" | "degrade" | "escalate";
  action: string;
  status: string;
  reversible: boolean;
  featureFlagKey?: string;
  details?: unknown;
}) {
  const [row] = await db
    .insert(remediationActions)
    .values({
      checkId: input.checkId,
      runId: input.runId,
      tier: input.tier,
      action: input.action,
      status: input.status,
      reversible: input.reversible,
      featureFlagKey: input.featureFlagKey,
      details: input.details as object | undefined,
    })
    .returning();

  await appendAudit({
    actor: "assurance-system",
    action: `remediation.${input.tier}`,
    entityType: "remediation_action",
    entityId: String(row.id),
    afterState: row,
  });

  return row;
}

/** safe_auto_fix: re-run the check / refresh its inputs. Capped against thrash. */
export async function applySafeAutoFix(
  check: Check,
  runId: number,
  runFn: () => Promise<void>,
): Promise<RemediationOutcome> {
  const recentCount = await countRecentAutoFixes(check.id);
  if (recentCount >= MAX_AUTO_FIXES_PER_WINDOW) {
    const { finding } = await escalate({
      checkId: check.id,
      severity: "high",
      title: `Auto-fix cap reached for ${check.name}`,
      description: `This check has already been auto-fixed ${recentCount} times in the last 24h (cap=${MAX_AUTO_FIXES_PER_WINDOW}). Escalating instead of fixing again to avoid a fix→break→fix loop.`,
    });
    const row = await recordAction({
      checkId: check.id,
      runId,
      tier: "escalate",
      action: "escalate_after_autofix_cap",
      status: "escalated",
      reversible: true,
      details: { findingId: finding.id, recentAutoFixCount: recentCount },
    });
    return {
      tier: "escalate",
      actionId: row.id,
      status: "escalated",
      capped: true,
      detail: `Auto-fix cap (${MAX_AUTO_FIXES_PER_WINDOW}/24h) reached — escalated instead.`,
    };
  }

  await runFn();
  const row = await recordAction({
    checkId: check.id,
    runId,
    tier: "safe_auto_fix",
    action: "rerun_failed_check",
    status: "applied",
    reversible: true,
    details: { note: "Re-ran the check's evaluation pipeline; no destructive side effects to revert." },
  });
  return {
    tier: "safe_auto_fix",
    actionId: row.id,
    status: "applied",
    capped: false,
    detail: "Check inputs refreshed and check re-run.",
  };
}

/** degrade: turn off the check's associated feature flag with a visible notice. */
export async function applyDegrade(check: Check, runId: number): Promise<RemediationOutcome> {
  if (!check.featureFlagKey) {
    const { finding } = await escalate({
      checkId: check.id,
      severity: "high",
      title: `${check.name} breached but has no feature flag to degrade`,
      description: "onBreach is 'degrade' but this check has no featureFlagKey configured — escalating instead.",
    });
    const row = await recordAction({
      checkId: check.id,
      runId,
      tier: "escalate",
      action: "escalate_missing_flag",
      status: "escalated",
      reversible: true,
      details: { findingId: finding.id },
    });
    return { tier: "escalate", actionId: row.id, status: "escalated", capped: false, detail: "No flag configured." };
  }

  const reason = `Auto-degraded by assurance check '${check.id}' (${check.name}) after a sustained breach of its threshold.`;
  await degradeFlag(check.featureFlagKey, reason, check.id);

  const row = await recordAction({
    checkId: check.id,
    runId,
    tier: "degrade",
    action: "degrade_feature_flag",
    status: "applied",
    reversible: true,
    featureFlagKey: check.featureFlagKey,
    details: { reason },
  });

  return {
    tier: "degrade",
    actionId: row.id,
    status: "applied",
    capped: false,
    detail: `Feature '${check.featureFlagKey}' disabled with a visible notice; restorable from Feature Safety.`,
  };
}

/** escalate: Finding + notification (Part 14), no system mutation. */
export async function applyEscalate(check: Check, runId: number, detail: string): Promise<RemediationOutcome> {
  const { finding } = await escalate({
    checkId: check.id,
    severity: "high",
    title: `Breach: ${check.name}`,
    description: detail,
  });
  const row = await recordAction({
    checkId: check.id,
    runId,
    tier: "escalate",
    action: "raise_finding",
    status: "escalated",
    reversible: true,
    details: { findingId: finding.id },
  });
  return { tier: "escalate", actionId: row.id, status: "escalated", capped: false, detail };
}

/** alert: lightweight notify-only tier — visible but does not open a Finding. */
export async function applyAlert(check: Check, runId: number, detail: string): Promise<RemediationOutcome> {
  const note = await notify({
    severity: "warn",
    title: `Alert: ${check.name}`,
    body: detail,
  });
  const row = await recordAction({
    checkId: check.id,
    runId,
    tier: "escalate",
    action: "alert_notify",
    status: "applied",
    reversible: true,
    details: { notificationId: note.id },
  });
  return { tier: "escalate", actionId: row.id, status: "applied", capped: false, detail };
}

/** Reverts a reversible remediation action (used by restore paths / tests). */
export async function revertRemediation(actionId: number, actor = "ops-user") {
  const [action] = await db.select().from(remediationActions).where(eq(remediationActions.id, actionId)).limit(1);
  if (!action) throw new Error(`Remediation action ${actionId} not found`);
  if (!action.reversible) throw new Error(`Remediation action ${actionId} is not reversible`);

  const [updated] = await db
    .update(remediationActions)
    .set({ status: "reverted", revertedAt: new Date() })
    .where(eq(remediationActions.id, actionId))
    .returning();

  await appendAudit({
    actor,
    action: "remediation.revert",
    entityType: "remediation_action",
    entityId: String(actionId),
    beforeState: action,
    afterState: updated,
  });

  return updated;
}
