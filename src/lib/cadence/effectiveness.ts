// LEADOS Part 25 — ritual effectiveness metrics.
// DIAGNOSTIC ONLY, per the standing honesty rule: "ritual metrics measure
// the ritual, never the people." Every number here is an occurrence-level
// aggregate (action completion rate for the ritual, decision-velocity change
// for the org) — there is no per-person rollup anywhere in this module or
// its schema (`ritual_effectiveness_snapshots` has no user_id column).
import { db } from "@/db";
import { actions, decisions, ritualEffectivenessSnapshots, ritualOccurrences } from "@/db/schema";
import { and, eq, gte, lt } from "drizzle-orm";

export interface EffectivenessSnapshot {
  occurrenceId: string;
  actionsOpened: number;
  actionsCompleted: number;
  actionCompletionRate: number | null;
  decisionVelocityBeforeHours: number | null;
  decisionVelocityAfterHours: number | null;
  decisionVelocityChangePct: number | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function decisionVelocityHours(orgId: string, from: Date, to: Date): Promise<number | null> {
  const rows = await db
    .select()
    .from(decisions)
    .where(and(eq(decisions.orgId, orgId), gte(decisions.raisedAt, from), lt(decisions.raisedAt, to)));
  const resolved = rows.filter((r) => r.committedAt);
  if (resolved.length === 0) return null;
  const totalHours = resolved.reduce((sum, r) => sum + (r.committedAt!.getTime() - r.raisedAt.getTime()) / 3600000, 0);
  return round2(totalHours / resolved.length);
}

/** Computes and persists the effectiveness snapshot for one occurrence,
 * looking at the actions it produced (completion rate) and the org's
 * decision velocity in the window after vs before the occurrence. */
export async function computeEffectiveness(occurrenceId: string): Promise<EffectivenessSnapshot> {
  const [occurrence] = await db.select().from(ritualOccurrences).where(eq(ritualOccurrences.id, occurrenceId)).limit(1);
  if (!occurrence) throw new Error(`No ritual occurrence found for id ${occurrenceId}`);

  const producedActions = await db.select().from(actions).where(eq(actions.sourceRitualOccurrenceId, occurrenceId));
  const actionsOpened = producedActions.length;
  const actionsCompleted = producedActions.filter((a) => a.status === "done").length;
  const actionCompletionRate = actionsOpened > 0 ? round2(actionsCompleted / actionsOpened) : null;

  const windowMs = 14 * 86400000; // 14-day windows either side of the occurrence
  const before = await decisionVelocityHours(
    occurrence.orgId,
    new Date(occurrence.scheduledFor.getTime() - windowMs),
    occurrence.scheduledFor,
  );
  const after = await decisionVelocityHours(
    occurrence.orgId,
    occurrence.scheduledFor,
    new Date(occurrence.scheduledFor.getTime() + windowMs),
  );
  const changePct = before && after && before !== 0 ? round2(((after - before) / before) * 100) : null;

  await db
    .insert(ritualEffectivenessSnapshots)
    .values({
      occurrenceId,
      actionsOpened,
      actionsCompleted,
      actionCompletionRate: actionCompletionRate === null ? null : String(actionCompletionRate),
      decisionVelocityBeforeHours: before === null ? null : String(before),
      decisionVelocityAfterHours: after === null ? null : String(after),
      decisionVelocityChangePct: changePct === null ? null : String(changePct),
    })
    .onConflictDoUpdate({
      target: ritualEffectivenessSnapshots.occurrenceId,
      set: {
        actionsOpened,
        actionsCompleted,
        actionCompletionRate: actionCompletionRate === null ? null : String(actionCompletionRate),
        decisionVelocityBeforeHours: before === null ? null : String(before),
        decisionVelocityAfterHours: after === null ? null : String(after),
        decisionVelocityChangePct: changePct === null ? null : String(changePct),
        computedAt: new Date(),
      },
    });

  return {
    occurrenceId,
    actionsOpened,
    actionsCompleted,
    actionCompletionRate,
    decisionVelocityBeforeHours: before,
    decisionVelocityAfterHours: after,
    decisionVelocityChangePct: changePct,
  };
}

export async function listEffectivenessForRitual(ritualId: string): Promise<EffectivenessSnapshot[]> {
  const occurrences = await db.select().from(ritualOccurrences).where(eq(ritualOccurrences.ritualId, ritualId));
  const results: EffectivenessSnapshot[] = [];
  for (const occ of occurrences) {
    const [snap] = await db
      .select()
      .from(ritualEffectivenessSnapshots)
      .where(eq(ritualEffectivenessSnapshots.occurrenceId, occ.id))
      .limit(1);
    if (!snap) continue;
    results.push({
      occurrenceId: occ.id,
      actionsOpened: snap.actionsOpened,
      actionsCompleted: snap.actionsCompleted,
      actionCompletionRate: snap.actionCompletionRate === null ? null : Number(snap.actionCompletionRate),
      decisionVelocityBeforeHours: snap.decisionVelocityBeforeHours === null ? null : Number(snap.decisionVelocityBeforeHours),
      decisionVelocityAfterHours: snap.decisionVelocityAfterHours === null ? null : Number(snap.decisionVelocityAfterHours),
      decisionVelocityChangePct: snap.decisionVelocityChangePct === null ? null : Number(snap.decisionVelocityChangePct),
    });
  }
  return results;
}
