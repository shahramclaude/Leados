// src/lib/events/asOf.ts
//
// "What did we believe on date X?" — reconstructs a single person's
// projected state directly from the event log, bounded by transaction
// time (`recordedAt <= asOf`), instead of from the live `people_projection`
// table. This is the retrospective/calibration primitive described in
// mission item 5: because every projection is a pure fold over the log,
// we can replay a prefix of that log in memory to get the point-in-time
// view without mutating anything.

import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";
import { rowToEvent } from "./eventStore";

export interface PersonStateAsOf {
  id: string;
  name: string;
  email: string | null;
  role: string;
  team: string;
  sentiment: number;
  engagement: number;
  flightRisk: number;
  lastCheckIn: string | null;
  asOf: string;
  eventsApplied: number;
}

const PERSON_EVENT_TYPES = ["person.added", "person.updated", "person.checkin", "person.exit_signal"];

export async function getPersonStateAsOf(personId: string, asOf: Date): Promise<PersonStateAsOf | null> {
  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.entityId, personId), lte(events.recordedAt, asOf)))
    .orderBy(asc(events.seq));

  const relevant = rows.filter((r) => PERSON_EVENT_TYPES.includes(r.type)).map(rowToEvent);
  if (relevant.length === 0) return null;

  const severityWeight: Record<string, number> = { low: 0.1, medium: 0.25, high: 0.45, critical: 0.7 };

  let state: Omit<PersonStateAsOf, "asOf" | "eventsApplied"> = {
    id: personId,
    name: "Unknown",
    email: null,
    role: "Unknown",
    team: "Unknown",
    sentiment: 0.5,
    engagement: 0.5,
    flightRisk: 0,
    lastCheckIn: null,
  };

  for (const event of relevant) {
    const data = event.data;
    if (event.type === "person.added") {
      state = {
        ...state,
        name: String(data.name ?? state.name),
        email: (data.email as string | undefined) ?? state.email,
        role: String(data.role ?? state.role),
        team: String(data.team ?? state.team),
      };
    } else if (event.type === "person.updated") {
      state = {
        ...state,
        name: typeof data.name === "string" ? data.name : state.name,
        email: typeof data.email === "string" ? data.email : state.email,
        role: typeof data.role === "string" ? data.role : state.role,
        team: typeof data.team === "string" ? data.team : state.team,
      };
    } else if (event.type === "person.checkin") {
      state = {
        ...state,
        sentiment: Number(data.sentiment ?? state.sentiment),
        engagement: Number(data.engagement ?? state.engagement),
        flightRisk: Number(data.flightRisk ?? state.flightRisk),
        lastCheckIn: event.ts,
      };
    } else if (event.type === "person.exit_signal") {
      const bump = severityWeight[String(data.severity ?? "medium")] ?? 0.25;
      state = { ...state, flightRisk: Math.max(state.flightRisk, bump) };
    }
  }

  return { ...state, asOf: asOf.toISOString(), eventsApplied: relevant.length };
}
