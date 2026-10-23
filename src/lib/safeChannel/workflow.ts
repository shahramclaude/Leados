// Case workflow: report -> triage -> investigate -> resolve/close.
// Every transition is logged as an event and the case-handling role
// requirement is enforced (same SAFE_CHANNEL_CASE_ROLES as metadata access).

import { db } from "@/db";
import { safeChannelReports, safeChannelCaseEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SAFE_CHANNEL_CASE_ROLES, Actor } from "@/lib/roles";
import { recordAudit } from "@/lib/audit";
import { SafeChannelAccessDenied } from "@/lib/safeChannel/store";

const TRANSITIONS: Record<string, string[]> = {
  open: ["triage"],
  triage: ["investigate", "closed"],
  investigate: ["resolved", "closed"],
  resolved: ["closed"],
  closed: [],
};

export async function transitionCase(params: { caseId: number; toStatus: string; notes?: string; actor: Actor }) {
  const allowed = params.actor.role != null && SAFE_CHANNEL_CASE_ROLES.includes(params.actor.role);
  if (!allowed) {
    throw new SafeChannelAccessDenied("You are not authorized to progress safe-channel cases.");
  }

  const [row] = await db.select().from(safeChannelReports).where(eq(safeChannelReports.id, params.caseId));
  if (!row) throw new Error("Case not found");

  const validNext = TRANSITIONS[row.status] ?? [];
  if (!validNext.includes(params.toStatus)) {
    throw new Error(`Cannot transition case from "${row.status}" to "${params.toStatus}". Valid: ${validNext.join(", ") || "none"}`);
  }

  await db.update(safeChannelReports).set({ status: params.toStatus }).where(eq(safeChannelReports.id, params.caseId));

  const [event] = await db
    .insert(safeChannelCaseEvents)
    .values({
      caseId: params.caseId,
      fromStatus: row.status,
      toStatus: params.toStatus,
      actorPersonId: params.actor.personId,
      notes: params.notes ?? "",
    })
    .returning();

  await recordAudit({
    actorId: params.actor.personId,
    actorRole: params.actor.role,
    action: "safe_channel.case_transitioned",
    resourceType: "safe_channel_case",
    resourceId: params.caseId,
    metadata: { fromStatus: row.status, toStatus: params.toStatus },
  });

  return event;
}
