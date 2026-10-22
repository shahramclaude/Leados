// src/lib/obligations.ts
//
// Obligation tracker: regulatory/contractual obligations -> controls ->
// evidence -> deadlines, with a DST-safe cadence/deadline engine ("Part 25"
// contract — not present in this sandbox, reconstructed per spec) and
// breach escalation.
//
// DST SAFETY: all deadline math is done by interpreting the obligation's
// wall-clock day-of-month/time-of-day IN ITS OWN IANA TIME ZONE via
// date-fns-tz's fromZonedTime/toZonedTime, which derives the correct UTC
// offset for the *specific* calendar date (not "now"), so a deadline such as
// "last calendar day of the quarter, 17:00 Europe/London" lands on the
// correct UTC instant whether that date falls in GMT or BST. We never do
// naive `date.setDate(date.getDate() + 90)` arithmetic, which is the classic
// DST/leap-aware bug source.

import { db } from "@/db";
import { obligations, obligationInstances, type ObligationCadence } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { addMonths, setDate, getDate as dfGetDate, lastDayOfMonth } from "date-fns";
import { appendAuditEvent } from "./audit";
import { createFinding } from "./findings";

export interface ObligationDefinition {
  code: string;
  title: string;
  source: "regulatory" | "contractual";
  description: string;
  cadence: ObligationCadence;
  timezone: string; // IANA, e.g. "Europe/London"
  anchorDate: string; // ISO instant used to derive time-of-day and starting period
  linkedControlIds?: number[];
  linkedRiskIds?: number[];
  owner: string;
}

export async function createObligation(def: ObligationDefinition) {
  const [row] = await db
    .insert(obligations)
    .values({ ...def, linkedControlIds: def.linkedControlIds ?? [], linkedRiskIds: def.linkedRiskIds ?? [] })
    .returning();
  return row;
}

export async function listObligations() {
  return db.select().from(obligations);
}

/**
 * Compute the next N due dates for an obligation's cadence, anchored to its
 * timezone's wall-clock day-of-month and the anchor's wall-clock time.
 * Returns UTC ISO instants (safe for storage/sorting) plus a human label.
 */
export function computeDueDates(
  cadence: ObligationCadence,
  timezone: string,
  anchorIso: string,
  count: number,
  from = new Date(),
): Array<{ periodLabel: string; dueAtIso: string }> {
  const anchorZoned = toZonedTime(new Date(anchorIso), timezone);
  const hh = anchorZoned.getHours();
  const mm = anchorZoned.getMinutes();

  if (cadence.kind === "once") {
    return [{ periodLabel: "one-off", dueAtIso: new Date(anchorIso).toISOString() }];
  }

  const results: Array<{ periodLabel: string; dueAtIso: string }> = [];
  const nowZoned = toZonedTime(from, timezone);
  let cursor = new Date(Date.UTC(nowZoned.getFullYear(), nowZoned.getMonth(), 1, 0, 0, 0));

  const stepMonths = cadence.kind === "monthly" ? 1 : cadence.kind === "quarterly" ? 3 : 12;
  const targetDay = cadence.kind === "annually" ? cadence.dayOfMonth : cadence.dayOfMonth;
  const targetMonthOffset = cadence.kind === "annually" ? cadence.month - 1 : null;

  // Align cursor to the correct starting month for annual cadence.
  if (cadence.kind === "annually" && targetMonthOffset !== null) {
    cursor = new Date(Date.UTC(nowZoned.getFullYear(), targetMonthOffset, 1));
  }

  let safetyCounter = 0;
  while (results.length < count && safetyCounter < count + 48) {
    safetyCounter++;
    const monthLastDay = dfGetDate(lastDayOfMonth(cursor));
    const dayInMonth = Math.min(targetDay, monthLastDay);
    const wallClockLocalDate = setDate(cursor, dayInMonth);
    // Build an explicit "local wall clock" string and convert to UTC for that exact date,
    // so DST offset is resolved for THIS date, not for "now".
    const y = wallClockLocalDate.getUTCFullYear();
    const m = wallClockLocalDate.getUTCMonth();
    const d = wallClockLocalDate.getUTCDate();
    const localWallClock = new Date(Date.UTC(y, m, d, hh, mm, 0));
    // Reinterpret that Y-M-D/H:M as wall time IN the target timezone:
    const localIsoNaive = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
    const dueUtc = fromZonedTime(localIsoNaive, timezone);

    if (dueUtc.getTime() >= from.getTime()) {
      const label =
        cadence.kind === "monthly"
          ? `${y}-${String(m + 1).padStart(2, "0")}`
          : cadence.kind === "quarterly"
            ? `${y}-Q${Math.floor(m / 3) + 1}`
            : `${y}`;
      results.push({ periodLabel: label, dueAtIso: dueUtc.toISOString() });
    }
    cursor = addMonths(cursor, stepMonths);
    void localWallClock; // retained for readability/debug symmetry; dueUtc is authoritative
  }

  return results;
}

/** Materialize obligation_instances rows for the next N upcoming periods (idempotent on periodLabel). */
export async function materializeUpcomingInstances(obligationId: number, count = 4) {
  const [ob] = await db.select().from(obligations).where(eq(obligations.id, obligationId));
  if (!ob) throw new Error(`obligation ${obligationId} not found`);
  const due = computeDueDates(ob.cadence, ob.timezone, ob.anchorDate, count);
  const existing = await db.select().from(obligationInstances).where(eq(obligationInstances.obligationId, obligationId));
  const existingLabels = new Set(existing.map((e) => e.periodLabel));
  const created = [];
  for (const d of due) {
    if (existingLabels.has(d.periodLabel)) continue;
    const [row] = await db
      .insert(obligationInstances)
      .values({ obligationId, periodLabel: d.periodLabel, dueAt: d.dueAtIso })
      .returning();
    created.push(row);
  }
  return created;
}

export type EscalationLevel = 0 | 1 | 2 | 3; // 0 pending, 1 reminder, 2 overdue, 3 breached/escalated

/**
 * Deadline/escalation sweep: call periodically (e.g. daily cron or on page
 * load for this demo). Escalation ladder:
 *   - T-7 days, no evidence  -> level 1 "reminder"
 *   - past due, no evidence  -> level 2 "overdue"
 *   - past due + grace (3d)  -> level 3 "breached" -> Finding raised
 */
export async function sweepObligationDeadlines(now = new Date()) {
  const instances = await db.select().from(obligationInstances);
  const changes: Array<{ id: number; from: string; to: string }> = [];
  for (const inst of instances) {
    if (inst.status === "evidenced") continue;
    const due = new Date(inst.dueAt).getTime();
    const graceMs = 3 * 86400000;
    let nextStatus = inst.status;
    let nextLevel = inst.escalationLevel;

    if (now.getTime() >= due + graceMs) {
      nextStatus = "breached";
      nextLevel = 3;
    } else if (now.getTime() >= due) {
      nextStatus = "overdue";
      nextLevel = 2;
    } else if (now.getTime() >= due - 7 * 86400000) {
      nextStatus = inst.status === "pending" ? "pending" : inst.status;
      nextLevel = Math.max(inst.escalationLevel, 1) as EscalationLevel;
    }

    if (nextStatus !== inst.status || nextLevel !== inst.escalationLevel) {
      await db
        .update(obligationInstances)
        .set({ status: nextStatus, escalationLevel: nextLevel })
        .where(eq(obligationInstances.id, inst.id));
      changes.push({ id: inst.id, from: inst.status, to: nextStatus });

      if (nextStatus === "breached" && inst.status !== "breached") {
        const [ob] = await db.select().from(obligations).where(eq(obligations.id, inst.obligationId));
        await appendAuditEvent({
          category: "obligation",
          entityType: "obligation_instance",
          entityId: String(inst.id),
          action: "obligation_breached",
          payload: { obligationCode: ob?.code, periodLabel: inst.periodLabel, dueAt: inst.dueAt },
          actor: "obligation-deadline-engine",
        });
        await createFinding({
          title: `Obligation breach: ${ob?.title ?? "unknown"} (${inst.periodLabel})`,
          severity: ob?.source === "regulatory" ? "critical" : "high",
          sourceType: "obligation_breach",
          sourceRef: String(inst.id),
          description: `Obligation ${ob?.code} period ${inst.periodLabel} passed its due date (${inst.dueAt}) plus grace period with no evidence recorded.`,
        });
      }
    }
  }
  return changes;
}

/** Record evidence that satisfies an obligation instance (writes to the audit chain). */
export async function recordObligationEvidence(instanceId: number, actor: string, note: string) {
  const evidence = await appendAuditEvent({
    category: "obligation",
    entityType: "obligation_instance",
    entityId: String(instanceId),
    action: "obligation_evidenced",
    payload: { note },
    actor,
  });
  await db
    .update(obligationInstances)
    .set({ status: "evidenced", evidenceAuditEventId: evidence.id, evidenceNote: note })
    .where(eq(obligationInstances.id, instanceId));
  return evidence;
}
