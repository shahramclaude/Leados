// src/lib/repositories/peopleRepository.ts — typed reads over
// people_projection. Hot path for the cockpit/today views; see
// docs/DATA.md "Hot path query plans" for the EXPLAIN output backing the
// (team) index used here.
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { peopleProjection } from "@/db/schema";

export type PersonRow = typeof peopleProjection.$inferSelect;

export async function listPeople(params: { team?: string; limit?: number; offset?: number } = {}): Promise<PersonRow[]> {
  const limit = Math.min(params.limit ?? 100, 500);
  const offset = params.offset ?? 0;
  const query = db.select().from(peopleProjection).orderBy(desc(peopleProjection.updatedAt)).limit(limit).offset(offset);
  if (params.team) {
    return db
      .select()
      .from(peopleProjection)
      .where(eq(peopleProjection.team, params.team))
      .orderBy(desc(peopleProjection.updatedAt))
      .limit(limit)
      .offset(offset);
  }
  return query;
}

export async function getPersonById(id: string): Promise<PersonRow | null> {
  const [row] = await db.select().from(peopleProjection).where(eq(peopleProjection.id, id)).limit(1);
  return row ?? null;
}

export async function countPeople(): Promise<number> {
  const rows = await db.select({ id: peopleProjection.id }).from(peopleProjection);
  return rows.length;
}

export async function topFlightRisk(limit = 5): Promise<PersonRow[]> {
  return db.select().from(peopleProjection).orderBy(desc(peopleProjection.flightRisk)).limit(limit);
}
