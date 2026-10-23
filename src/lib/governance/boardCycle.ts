// Board cycle engine: cadence (Part 25) -> meeting -> materials deadline ->
// escalation. Pure scheduling/state-machine logic; pack assembly content is
// in packAssembly.ts.

import { db } from "@/db";
import { boardCalendar, boardMeetings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { appendAuditEntry } from "./auditChain";

export type EscalationLevel = 0 | 1 | 2 | 3;

export async function upsertCadence(params: {
  tier: string;
  cadenceDays: number;
  materialsLeadDays?: number;
  firstMeetingDate: Date;
}) {
  const existing = await db
    .select()
    .from(boardCalendar)
    .where(eq(boardCalendar.tier, params.tier));

  if (existing.length > 0) {
    const [row] = await db
      .update(boardCalendar)
      .set({
        cadenceDays: params.cadenceDays,
        materialsLeadDays: params.materialsLeadDays ?? 7,
        nextMeetingDate: params.firstMeetingDate,
      })
      .where(eq(boardCalendar.tier, params.tier))
      .returning();
    return row;
  }

  const [row] = await db
    .insert(boardCalendar)
    .values({
      tier: params.tier,
      cadenceDays: params.cadenceDays,
      materialsLeadDays: params.materialsLeadDays ?? 7,
      nextMeetingDate: params.firstMeetingDate,
    })
    .returning();
  return row;
}

/** Schedules the next meeting for a tier based on its cadence and creates
 * the materials deadline (meeting date - materialsLeadDays). */
export async function scheduleNextMeeting(tier: string) {
  const [cal] = await db
    .select()
    .from(boardCalendar)
    .where(eq(boardCalendar.tier, tier));

  if (!cal || !cal.nextMeetingDate) {
    throw new Error(`No cadence configured for board tier "${tier}"`);
  }

  const scheduledAt = new Date(cal.nextMeetingDate);
  const materialsDeadline = new Date(scheduledAt);
  materialsDeadline.setDate(materialsDeadline.getDate() - cal.materialsLeadDays);

  const [meeting] = await db
    .insert(boardMeetings)
    .values({
      tier,
      scheduledAt,
      materialsDeadline,
      status: "scheduled",
    })
    .returning();

  const followOn = new Date(scheduledAt);
  followOn.setDate(followOn.getDate() + cal.cadenceDays);
  await db
    .update(boardCalendar)
    .set({ lastMeetingDate: scheduledAt, nextMeetingDate: followOn })
    .where(eq(boardCalendar.tier, tier));

  await appendAuditEntry({
    action: "board_meeting.scheduled",
    entityType: "board_meeting",
    entityId: meeting.id,
    payload: { tier, scheduledAt, materialsDeadline },
  });

  return meeting;
}

/** Computes an escalation level for a meeting based on how close/overdue
 * the materials deadline is relative to "now". 0 = on track, 3 = breached. */
export function computeEscalationLevel(materialsDeadline: Date, now: Date): EscalationLevel {
  const msToDeadline = materialsDeadline.getTime() - now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (msToDeadline < 0) return 3; // deadline passed
  if (msToDeadline <= 1 * dayMs) return 2; // <= 1 day left
  if (msToDeadline <= 3 * dayMs) return 1; // <= 3 days left
  return 0;
}

export async function reviewDeadlineEscalation(meetingId: number, now: Date = new Date()) {
  const [meeting] = await db
    .select()
    .from(boardMeetings)
    .where(eq(boardMeetings.id, meetingId));
  if (!meeting) throw new Error("Meeting not found");

  const level = computeEscalationLevel(meeting.materialsDeadline, now);
  const nextStatus =
    level >= 3 && meeting.status === "scheduled" ? "materials_due" : meeting.status;

  const [updated] = await db
    .update(boardMeetings)
    .set({ escalationLevel: level, status: nextStatus })
    .where(eq(boardMeetings.id, meetingId))
    .returning();

  if (level >= 2 && level !== meeting.escalationLevel) {
    await appendAuditEntry({
      action: "board_meeting.deadline_escalated",
      entityType: "board_meeting",
      entityId: meetingId,
      payload: { level, materialsDeadline: meeting.materialsDeadline },
    });
  }

  return updated;
}
