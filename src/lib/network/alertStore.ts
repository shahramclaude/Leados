// LEADOS Part 31 — persistence + de-duplication for dependency alerts.
// Keeps the pure threshold logic in alerts.ts testable while this module
// handles the "don't spam the same open alert twice" rule and the Part 13
// notification hand-off (represented by notifyChannel).

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { dependencyAlerts } from "@/db/schema";
import type { DependencyAlertDraft } from "./alerts";

export async function recordAlertIfNew(draft: DependencyAlertDraft) {
  const [existingOpen] = await db
    .select()
    .from(dependencyAlerts)
    .where(
      and(
        eq(dependencyAlerts.alertType, draft.alertType),
        eq(dependencyAlerts.subjectRef, draft.subjectRef),
        eq(dependencyAlerts.status, "open"),
      ),
    )
    .limit(1);

  if (existingOpen) {
    return existingOpen;
  }

  const [created] = await db
    .insert(dependencyAlerts)
    .values({
      alertType: draft.alertType,
      subjectRef: draft.subjectRef,
      severity: draft.severity,
      message: draft.message,
      notifyChannel: draft.notifyChannel,
    })
    .returning();

  return created;
}
