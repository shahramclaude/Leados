// Part 09-G: GDPR-Art.15-style transparency view ("what LEADOS knows about
// me, why, and from which events"), plus erasure wired to the Part 01
// tombstone flow. Scoped to self + HR only (see accessControl.ts policy).

import { db } from "@/db";
import { people, actors, events } from "@/db/schema";
import { eq } from "drizzle-orm";
import { allEventsFor, appendEvent } from "./events";
import { type Actor, canReadTransparencyReport, canRequestErasure, assertAccess } from "./accessControl";

export interface TransparencyField {
  field: string;
  value: unknown;
  why: string;
  lawfulBasis: string;
  sourceEventIds: string[];
}

export interface TransparencyReport {
  personId: string;
  generatedAt: string;
  fields: TransparencyField[];
  consent: { scope: string; status: "granted" | "revoked"; occurredAt: string }[];
  totalEventsHeld: number;
}

export async function getTransparencyReport(actor: Actor, personId: string): Promise<TransparencyReport> {
  assertAccess(
    canReadTransparencyReport(actor, personId),
    `actor ${actor.id} (${actor.globalRole}) may not read the transparency report for ${personId}`,
  );

  const [row] = await db
    .select({
      id: actors.id,
      name: actors.name,
      email: actors.email,
      role: people.role,
      compaRatio: people.compaRatio,
      teamId: people.teamId,
    })
    .from(people)
    .innerJoin(actors, eq(actors.id, people.id))
    .where(eq(people.id, personId))
    .limit(1);
  if (!row) throw new Error("Person not found");

  const all = await allEventsFor(personId);

  const fields: TransparencyField[] = [
    {
      field: "name",
      value: row.name,
      why: "Identity record required to operate LEADOS.",
      lawfulBasis: "Performance of employment contract.",
      sourceEventIds: [],
    },
    {
      field: "role",
      value: row.role,
      why: "Used for succession, skills-gap and compensation-band context.",
      lawfulBasis: "Legitimate interest: workforce planning.",
      sourceEventIds: all.filter((e) => e.type === "ROLE_CHANGED" || e.type === "PERSON_HIRED").map((e) => e.id),
    },
    {
      field: "compaRatio",
      value: row.compaRatio,
      why: "Used as one input (gap below band) to the flight-risk estimate shown to you and your manager.",
      lawfulBasis: "Legitimate interest: pay equity and retention planning.",
      sourceEventIds: all.filter((e) => e.type === "COMPA_RATIO_UPDATED").map((e) => e.id),
    },
    {
      field: "oneOnOneHistory",
      value: all.filter((e) => e.type === "ONE_ON_ONE_HELD").length,
      why: "Used to estimate 1:1 cadence, a flight-risk and engagement input.",
      lawfulBasis: "Legitimate interest: management support.",
      sourceEventIds: all.filter((e) => e.type === "ONE_ON_ONE_HELD").map((e) => e.id),
    },
    {
      field: "skillsEvidence",
      value: all.filter((e) => e.type === "SKILL_DECLARED" || e.type === "SKILL_OBSERVED").length,
      why: "Used for succession readiness and internal-mobility suggestions.",
      lawfulBasis: "Legitimate interest: career development.",
      sourceEventIds: all.filter((e) => e.type === "SKILL_DECLARED" || e.type === "SKILL_OBSERVED").map((e) => e.id),
    },
  ];

  const consentEvents = all.filter((e) => e.type === "CONSENT_GRANTED" || e.type === "CONSENT_REVOKED");
  const consent = consentEvents.map((e) => ({
    scope: (e.payload as { scope?: string }).scope ?? "general",
    status: e.type === "CONSENT_GRANTED" ? ("granted" as const) : ("revoked" as const),
    occurredAt: e.occurredAt.toISOString(),
  }));

  return {
    personId,
    generatedAt: new Date().toISOString(),
    fields,
    consent,
    totalEventsHeld: all.length,
  };
}

/**
 * Erasure flow (Part 01 tombstone pattern): we do not hard-delete event rows
 * (that would break audit/referential integrity and counts other people's
 * aggregates may depend on, e.g. team attrition rate). Instead we scrub the
 * payload and mark the event tombstoned, and record the erasure itself as an
 * event for audit purposes.
 */
export async function requestErasure(actor: Actor, personId: string): Promise<{ tombstonedEvents: number }> {
  assertAccess(canRequestErasure(actor, personId), `actor ${actor.id} may not request erasure for ${personId}`);

  await appendEvent({
    type: "ERASURE_REQUESTED",
    entityType: "person",
    entityId: personId,
    actorId: actor.id,
    payload: {},
  });

  const rows = await db.select().from(events).where(eq(events.entityId, personId));
  for (const row of rows) {
    await db
      .update(events)
      .set({ payload: { tombstoned: true }, tombstonedAt: new Date() })
      .where(eq(events.id, row.id));
  }

  await appendEvent({
    type: "ERASURE_COMPLETED",
    entityType: "person",
    entityId: personId,
    actorId: actor.id,
    payload: { tombstonedEvents: rows.length },
  });

  return { tombstonedEvents: rows.length };
}
