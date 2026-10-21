// Part 09-A: the canonical person aggregate, projected from the event log,
// with per-field provenance and an `asOf` belief-state timeline. This is the
// repository layer — every function here enforces access control itself;
// callers (API routes) must NOT re-derive visibility in the UI layer.

import { db } from "@/db";
import { actors, people, teams } from "@/db/schema";
import { eq } from "drizzle-orm";
import { eventsAsOf, allEventsFor } from "./events";
import {
  type Actor,
  canReadPersonAggregate,
  canReadHrOnlyFields,
  assertAccess,
} from "./accessControl";

export interface FieldProvenance<T> {
  value: T;
  /** Event id(s) or source ('system_of_record') this field value is derived from. */
  sourceEventIds: string[];
  /** When this field value was last updated, per the event log. */
  asOfEventTime: string | null;
}

export interface PersonAggregate {
  id: string;
  name: string;
  email: string;
  role: FieldProvenance<string>;
  title: FieldProvenance<string>;
  team: FieldProvenance<{ id: string | null; name: string | null }>;
  managerId: FieldProvenance<string | null>;
  tenureStart: string;
  tenureMonths: number;
  compaRatio: FieldProvenance<number | null> | null; // null entirely if caller may not see it
  status: string;
  /** Belief-state timestamp this aggregate reflects. */
  asOf: string;
  /** True when some fields were withheld because of the viewer's role. */
  redactions: string[];
}

function monthsBetween(start: Date, end: Date): number {
  return (
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth())
  );
}

/**
 * Loads the canonical person aggregate as of `asOf` (defaults to now),
 * enforcing repository-layer access control and field-level redaction.
 */
export async function getPersonAggregate(
  actor: Actor,
  personId: string,
  asOf: Date = new Date(),
): Promise<PersonAggregate> {
  const [row] = await db
    .select({
      id: actors.id,
      name: actors.name,
      email: actors.email,
      role: people.role,
      title: people.title,
      teamId: people.teamId,
      teamName: teams.name,
      managerId: people.managerId,
      tenureStart: people.tenureStart,
      compaRatio: people.compaRatio,
      status: people.status,
    })
    .from(people)
    .innerJoin(actors, eq(actors.id, people.id))
    .leftJoin(teams, eq(teams.id, people.teamId))
    .where(eq(people.id, personId))
    .limit(1);

  if (!row) {
    throw new Error(`Person ${personId} not found`);
  }

  assertAccess(
    canReadPersonAggregate(actor, { id: row.id, managerId: row.managerId }),
    `actor ${actor.id} (${actor.globalRole}) may not read person ${personId}`,
  );

  const history = await eventsAsOf(personId, asOf);
  const redactions: string[] = [];

  function provenanceFor<T>(eventTypes: string[], value: T): FieldProvenance<T> {
    const matches = history.filter((e) => eventTypes.includes(e.type));
    const last = matches[matches.length - 1];
    return {
      value,
      sourceEventIds: matches.map((m) => m.id),
      asOfEventTime: last ? last.occurredAt.toISOString() : null,
    };
  }

  const showCompaRatio = canReadHrOnlyFields(actor) || actor.id === row.id || actor.globalRole === "manager";
  let compaRatio: FieldProvenance<number | null> | null = null;
  if (showCompaRatio) {
    compaRatio = provenanceFor(
      ["COMPA_RATIO_UPDATED"],
      row.compaRatio !== null ? Number(row.compaRatio) : null,
    );
  } else {
    redactions.push("compaRatio");
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: provenanceFor(["ROLE_CHANGED", "PERSON_HIRED"], row.role),
    title: provenanceFor(["ROLE_CHANGED", "PERSON_HIRED"], row.title),
    team: provenanceFor(["TEAM_CHANGED", "PERSON_HIRED"], {
      id: row.teamId,
      name: row.teamName,
    }),
    managerId: provenanceFor(["MANAGER_CHANGED", "PERSON_HIRED"], row.managerId),
    tenureStart: row.tenureStart,
    tenureMonths: monthsBetween(new Date(row.tenureStart), asOf),
    compaRatio,
    status: row.status,
    asOf: asOf.toISOString(),
    redactions,
  };
}

export interface TimelineEntry {
  eventId: string;
  type: string;
  occurredAt: string;
  recordedAt: string;
  summary: string;
}

/**
 * Full provenance timeline for a person: every event LEADOS has recorded
 * about them, in the order it learned about them. Access-controlled
 * identically to the aggregate (same reader set).
 */
export async function getPersonTimeline(actor: Actor, personId: string): Promise<TimelineEntry[]> {
  const [row] = await db
    .select({ id: people.id, managerId: people.managerId })
    .from(people)
    .where(eq(people.id, personId))
    .limit(1);
  if (!row) throw new Error(`Person ${personId} not found`);
  assertAccess(
    canReadPersonAggregate(actor, row),
    `actor ${actor.id} (${actor.globalRole}) may not read the timeline of ${personId}`,
  );

  const all = await allEventsFor(personId);
  return all.map((e) => ({
    eventId: e.id,
    type: e.type,
    occurredAt: e.occurredAt.toISOString(),
    recordedAt: e.recordedAt.toISOString(),
    summary: summarize(e.type, e.payload as Record<string, unknown>),
  }));
}

function summarize(type: string, payload: Record<string, unknown>): string {
  switch (type) {
    case "PERSON_HIRED":
      return `Hired as ${payload.title ?? "unknown title"}`;
    case "ROLE_CHANGED":
      return `Role changed to ${payload.role ?? "unknown"}`;
    case "MANAGER_CHANGED":
      return `Manager changed to ${payload.managerId ?? "unknown"}`;
    case "TEAM_CHANGED":
      return `Team changed to ${payload.teamId ?? "unknown"}`;
    case "COMPA_RATIO_UPDATED":
      return `Compa-ratio updated`;
    case "SKILL_DECLARED":
      return `Declared skill ${payload.skillId ?? ""} at level ${payload.level ?? ""}`;
    case "SKILL_OBSERVED":
      return `Observed evidence for skill ${payload.skillId ?? ""}`;
    case "ONE_ON_ONE_HELD":
      return `1:1 held`;
    case "COMMITMENT_CREATED":
      return `Commitment made: ${payload.description ?? ""}`;
    case "COMMITMENT_RESOLVED":
      return `Commitment ${payload.status ?? "resolved"}`;
    case "GROWTH_PLAN_CREATED":
      return `Growth plan started: ${payload.title ?? ""}`;
    case "GROWTH_PLAN_MILESTONE_UPDATED":
      return `Growth plan milestone updated`;
    case "CONSENT_GRANTED":
      return `Consent granted: ${payload.scope ?? ""}`;
    case "CONSENT_REVOKED":
      return `Consent revoked: ${payload.scope ?? ""}`;
    case "ERASURE_REQUESTED":
      return `Erasure requested`;
    case "ERASURE_COMPLETED":
      return `Erasure completed`;
    case "TERMINATION_RECORDED":
      return `Termination recorded`;
    default:
      return type;
  }
}
