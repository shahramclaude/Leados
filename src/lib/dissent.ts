// Dissent preservation / anonymous suggestion ("whisper") channel.
//
// Core guarantee under test: NO single role, however senior, can suppress
// (delete/hide/suppress) an anonymous suggestion. attemptSuppress() always
// records the attempt and ALWAYS returns blocked:true — there is no code
// path in which a single actor succeeds. The only legitimate way content
// ever stops being publicly listed is archiveViaDualControl(), which
// requires a genuine two-person approval (via the same dual-control engine
// used for T4 power actions) and never deletes the row — it only flips
// status to "archived" with a reason, fully visible in the audit trail.

import { db } from "@/db";
import { dissentSuggestions, dissentSuppressionAttempts, dissentArchiveRequests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashSecret, randomToken } from "@/lib/crypto";
import { recordAudit } from "@/lib/audit";
import { requestAction, approveAction } from "@/lib/powerActions";
import { Actor } from "@/lib/roles";

export async function submitSuggestion(params: { body: string; category?: string }) {
  const claimToken = randomToken(10);
  const [row] = await db
    .insert(dissentSuggestions)
    .values({
      body: params.body,
      category: params.category ?? "general",
      claimTokenHash: hashSecret(claimToken, "dissent-claim"),
      status: "open",
    })
    .returning();

  await recordAudit({
    action: "dissent.suggestion_submitted",
    resourceType: "dissent_suggestion",
    resourceId: row.id,
    metadata: { category: row.category },
  });

  return { id: row.id, claimToken };
}

export async function listSuggestions() {
  // Always returns ALL non-deleted suggestions regardless of caller role —
  // there is no role-based filter here by design: visibility cannot be
  // narrowed to suppress dissent from certain audiences.
  return db.select().from(dissentSuggestions);
}

export interface SuppressionResult {
  blocked: true;
  reason: string;
}

/**
 * A single-actor suppression attempt. ALWAYS blocked, regardless of role —
 * this function has no success branch. It exists so attempts are logged and
 * so the UI/API can give a clear, honest explanation rather than a generic
 * 403 with no reasoning.
 */
export async function attemptSuppress(params: {
  suggestionId: number;
  attemptedAction: "delete" | "hide" | "suppress";
  actor: Actor;
}): Promise<SuppressionResult> {
  const reason =
    "Blocked by design: anonymous dissent cannot be suppressed by any single role, including this one " +
    `(${params.actor.role ?? "unknown"}). Use the dual-control archive workflow if the suggestion has ` +
    "genuinely been resolved — that keeps it visible in the audit trail rather than deleting it.";

  await db.insert(dissentSuppressionAttempts).values({
    suggestionId: params.suggestionId,
    attemptedByPersonId: params.actor.personId ?? 0,
    attemptedByRole: params.actor.role ?? "unknown",
    attemptedAction: params.attemptedAction,
    blocked: true,
    reason,
  });

  await recordAudit({
    actorId: params.actor.personId,
    actorRole: params.actor.role,
    action: "dissent.suppression_attempt_blocked",
    resourceType: "dissent_suggestion",
    resourceId: params.suggestionId,
    metadata: { attemptedAction: params.attemptedAction },
  });

  return { blocked: true, reason };
}

/** Legitimate archive path: requires dual control, never deletes content. */
export async function requestArchive(params: { suggestionId: number; requestedByPersonId: number; requestedByRole: string; reason: string }) {
  const action = await requestAction({
    actionType: "dissent_suggestion_archive",
    payload: { suggestionId: params.suggestionId, reason: params.reason },
    requestedByPersonId: params.requestedByPersonId,
    requestedByRole: params.requestedByRole,
  });
  await db.insert(dissentArchiveRequests).values({ suggestionId: params.suggestionId, dualControlActionId: action.id });
  return action;
}

export async function approveArchive(params: { actionId: number; approverPersonId: number; approverRole: string }) {
  const result = await approveAction({
    actionId: params.actionId,
    approverPersonId: params.approverPersonId,
    approverRole: params.approverRole,
  });

  if (result.status === "executed" && result.action) {
    const [link] = await db
      .select()
      .from(dissentArchiveRequests)
      .where(eq(dissentArchiveRequests.dualControlActionId, result.action.id));
    if (link) {
      const payload = result.action.payload as { reason?: string };
      await db
        .update(dissentSuggestions)
        .set({ status: "archived", archiveReason: payload.reason ?? "Archived via dual control." })
        .where(eq(dissentSuggestions.id, link.suggestionId));
    }
  }

  return result;
}

export async function listSuppressionAttempts(suggestionId?: number) {
  if (suggestionId != null) {
    return db.select().from(dissentSuppressionAttempts).where(eq(dissentSuppressionAttempts.suggestionId, suggestionId));
  }
  return db.select().from(dissentSuppressionAttempts);
}
