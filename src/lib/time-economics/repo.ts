// LEADOS — Part 45: Data access layer for the Time & Meeting Economics engine.
// Centralizes Drizzle queries so API routes stay thin and the privacy
// enforcement matrix (privacy.ts) has one place to be invoked consistently.

import { db } from "@/db";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  orgs,
  users,
  teams,
  teamMembers,
  orgConfig,
  userRates,
  strategyPillars,
  topicStrategyMap,
  calendarEvents,
  eventAttendees,
  meetingOutcomes,
  meetingClassifications,
  interactionEvents,
  noMeetingWindows,
  schedulingSuggestions,
  timeDataConsent,
  privacyAuditLog,
} from "@/db/schema";
import type { Role } from "./types";

export async function getDemoOrg() {
  const [org] = await db.select().from(orgs).limit(1);
  return org ?? null;
}

export async function getActorFromRequest(req: Request): Promise<{ id: string; role: Role } | null> {
  const userId = req.headers.get("x-user-id");
  if (!userId) return null;
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u) return null;
  return { id: u.id, role: u.role as Role };
}

export async function getOrgConfigOrDefault(orgId: string) {
  const [cfg] = await db.select().from(orgConfig).where(eq(orgConfig.orgId, orgId)).limit(1);
  return (
    cfg ?? {
      orgId,
      currency: "USD",
      defaultLoadedHourlyRate: "85.00",
      deepWorkPremiumMultiplier: "1.50",
      recoveryMinutesPerInterruption: 23,
      workDayStartMinute: 9 * 60,
      workDayEndMinute: 17 * 60,
      zeroOutcomeWeeksThreshold: 6,
    }
  );
}

export async function getUserRate(userId: string, fallback: number): Promise<number> {
  const [r] = await db.select().from(userRates).where(eq(userRates.userId, userId)).limit(1);
  return r ? Number(r.loadedHourlyRate) : fallback;
}

export async function listOrgUsers(orgId: string) {
  return db.select().from(users).where(eq(users.orgId, orgId));
}

export async function getUserById(userId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return u ?? null;
}

export async function getConsent(userId: string) {
  const [c] = await db.select().from(timeDataConsent).where(eq(timeDataConsent.userId, userId)).limit(1);
  return c ?? null;
}

export async function upsertConsent(userId: string, shareAggregateOnly: boolean, allowManagerView: boolean) {
  const existing = await getConsent(userId);
  if (existing) {
    await db
      .update(timeDataConsent)
      .set({ shareAggregateOnly, allowManagerView, updatedAt: new Date() })
      .where(eq(timeDataConsent.userId, userId));
  } else {
    await db.insert(timeDataConsent).values({ userId, shareAggregateOnly, allowManagerView });
  }
}

export async function logPrivacyDecision(
  actorId: string,
  targetUserId: string | null,
  resource: string,
  allowed: boolean,
  reason: string,
) {
  await db.insert(privacyAuditLog).values({ actorId, targetUserId, resource, allowed, reason });
}

export async function listPrivacyAuditLog(limit = 50) {
  return db.select().from(privacyAuditLog).orderBy(desc(privacyAuditLog.createdAt)).limit(limit);
}

export async function listEventsForOrg(orgId: string, since?: Date) {
  const conditions = since
    ? and(eq(calendarEvents.orgId, orgId), gte(calendarEvents.startTime, since))
    : eq(calendarEvents.orgId, orgId);
  return db.select().from(calendarEvents).where(conditions).orderBy(desc(calendarEvents.startTime));
}

export async function getEvent(eventId: string) {
  const [e] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, eventId)).limit(1);
  return e ?? null;
}

export async function listAttendeesForEvent(eventId: string) {
  return db
    .select({
      userId: eventAttendees.userId,
      required: eventAttendees.required,
      name: users.name,
      timezone: users.timezone,
      chronotype: users.chronotype,
    })
    .from(eventAttendees)
    .innerJoin(users, eq(users.id, eventAttendees.userId))
    .where(eq(eventAttendees.eventId, eventId));
}

export async function listEventsForUser(userId: string, orgId: string) {
  return db
    .select({ event: calendarEvents })
    .from(eventAttendees)
    .innerJoin(calendarEvents, eq(calendarEvents.id, eventAttendees.eventId))
    .where(and(eq(eventAttendees.userId, userId), eq(calendarEvents.orgId, orgId)));
}

export async function getOutcomesForEvent(eventId: string) {
  const [o] = await db.select().from(meetingOutcomes).where(eq(meetingOutcomes.eventId, eventId)).limit(1);
  return o ?? null;
}

export async function listRecurrenceKeysForOrg(orgId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ recurrenceKey: calendarEvents.recurrenceKey })
    .from(calendarEvents)
    .where(and(eq(calendarEvents.orgId, orgId), eq(calendarEvents.isRecurring, true)));
  return rows.map((r) => r.recurrenceKey).filter((k): k is string => Boolean(k));
}

export async function listInstancesForRecurrence(orgId: string, recurrenceKey: string) {
  return db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.orgId, orgId), eq(calendarEvents.recurrenceKey, recurrenceKey)))
    .orderBy(calendarEvents.startTime);
}

export async function listOutcomesForEventIds(eventIds: string[]) {
  if (eventIds.length === 0) return [];
  return db.select().from(meetingOutcomes).where(inArray(meetingOutcomes.eventId, eventIds));
}

export async function getTopicStrategyMap(orgId: string) {
  return db.select().from(topicStrategyMap).where(eq(topicStrategyMap.orgId, orgId));
}

export async function getStrategyPillars(orgId: string) {
  return db.select().from(strategyPillars).where(eq(strategyPillars.orgId, orgId));
}

export async function upsertClassification(
  eventId: string,
  category: string,
  confidence: number,
  pillarId: string | null,
  method: string,
) {
  const existing = await db
    .select()
    .from(meetingClassifications)
    .where(eq(meetingClassifications.eventId, eventId))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(meetingClassifications)
      .set({ category, confidence: confidence.toString(), pillarId, method, classifiedAt: new Date() })
      .where(eq(meetingClassifications.eventId, eventId));
  } else {
    await db.insert(meetingClassifications).values({
      eventId,
      category,
      confidence: confidence.toString(),
      pillarId,
      method,
    });
  }
}

export async function getClassification(eventId: string) {
  const [c] = await db
    .select()
    .from(meetingClassifications)
    .where(eq(meetingClassifications.eventId, eventId))
    .limit(1);
  return c ?? null;
}

export async function listInteractionEventsForUser(userId: string, orgId: string, since: Date) {
  return db
    .select()
    .from(interactionEvents)
    .where(
      and(
        eq(interactionEvents.userId, userId),
        eq(interactionEvents.orgId, orgId),
        gte(interactionEvents.occurredAt, since),
      ),
    )
    .orderBy(interactionEvents.occurredAt);
}

export async function listNoMeetingWindows(orgId: string) {
  return db.select().from(noMeetingWindows).where(eq(noMeetingWindows.orgId, orgId));
}

export async function createNoMeetingWindow(input: {
  orgId: string;
  scope: string;
  scopeId: string | null;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  enforced: boolean;
  label: string;
  createdBy: string;
}) {
  const [row] = await db.insert(noMeetingWindows).values(input).returning();
  return row;
}

export async function createSchedulingSuggestion(orgId: string, requestedBy: string, payload: unknown) {
  const [row] = await db
    .insert(schedulingSuggestions)
    .values({ orgId, requestedBy, payload: payload as object, status: "proposed" })
    .returning();
  return row;
}

export async function getSchedulingSuggestion(id: string) {
  const [row] = await db.select().from(schedulingSuggestions).where(eq(schedulingSuggestions.id, id)).limit(1);
  return row ?? null;
}

export async function confirmSchedulingSuggestion(id: string, confirmedBy: string, chosenSlot: unknown) {
  const [row] = await db
    .update(schedulingSuggestions)
    .set({ status: "confirmed", confirmedBy, confirmedAt: new Date(), chosenSlot: chosenSlot as object })
    .where(eq(schedulingSuggestions.id, id))
    .returning();
  return row ?? null;
}

export async function rejectSchedulingSuggestion(id: string, rejectedBy: string) {
  const [row] = await db
    .update(schedulingSuggestions)
    .set({ status: "rejected", confirmedBy: rejectedBy, confirmedAt: new Date() })
    .where(eq(schedulingSuggestions.id, id))
    .returning();
  return row ?? null;
}

export async function listTeamsWithMembers(orgId: string) {
  const teamRows = await db.select().from(teams).where(eq(teams.orgId, orgId));
  const result = [];
  for (const t of teamRows) {
    const members = await db
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, t.id));
    result.push({ ...t, memberIds: members.map((m) => m.userId) });
  }
  return result;
}

export async function orgUserCount(orgId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.orgId, orgId));
  return row?.count ?? 0;
}
