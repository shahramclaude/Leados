// Part 01 stand-in: a minimal append-only event store used as the single
// source of truth for the person timeline, provenance, and the
// "what did LEADOS believe about this person on date X" projection.

import { db } from "@/db";
import { events } from "@/db/schema";
import { and, asc, eq, lte } from "drizzle-orm";
import { newId } from "./ids";

export type EventType =
  | "PERSON_HIRED"
  | "ROLE_CHANGED"
  | "MANAGER_CHANGED"
  | "TEAM_CHANGED"
  | "COMPA_RATIO_UPDATED"
  | "SKILL_DECLARED"
  | "SKILL_OBSERVED"
  | "GOAL_SET"
  | "GOAL_UPDATED"
  | "ONE_ON_ONE_HELD"
  | "COMMITMENT_CREATED"
  | "COMMITMENT_RESOLVED"
  | "GROWTH_PLAN_CREATED"
  | "GROWTH_PLAN_MILESTONE_UPDATED"
  | "CONSENT_GRANTED"
  | "CONSENT_REVOKED"
  | "ERASURE_REQUESTED"
  | "ERASURE_COMPLETED"
  | "TERMINATION_RECORDED";

export interface AppendEventInput {
  type: EventType;
  entityType: "person" | "team" | "oneOnOne" | "growthPlan";
  entityId: string;
  payload: Record<string, unknown>;
  actorId?: string | null;
  occurredAt?: Date;
}

export async function appendEvent(input: AppendEventInput) {
  const id = newId("evt");
  const occurredAt = input.occurredAt ?? new Date();
  await db.insert(events).values({
    id,
    type: input.type,
    entityType: input.entityType,
    entityId: input.entityId,
    payload: input.payload,
    actorId: input.actorId ?? null,
    occurredAt,
    recordedAt: new Date(),
  });
  return id;
}

/**
 * Returns every event about `entityId` that LEADOS had recorded as of
 * `asOf` (inclusive), ordered chronologically by recordedAt. This is the
 * "belief state" projection: an event that occurred in the past but was
 * entered late is excluded until its recordedAt.
 */
export async function eventsAsOf(entityId: string, asOf: Date) {
  return db
    .select()
    .from(events)
    .where(and(eq(events.entityId, entityId), lte(events.recordedAt, asOf)))
    .orderBy(asc(events.recordedAt));
}

export async function allEventsFor(entityId: string) {
  return db.select().from(events).where(eq(events.entityId, entityId)).orderBy(asc(events.recordedAt));
}
