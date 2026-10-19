// src/lib/repositories/orgFactsRepository.ts — bitemporal reads over
// org_facts. `asOf` answers "what did we believe was true in the world at
// time X", using both the validFrom/validTo (world time) axis and the
// recordedAt (transaction time, via events.recordedAt indirectly) axis.
import { and, asc, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { orgFacts } from "@/db/schema";

export type OrgFactRow = typeof orgFacts.$inferSelect;

export async function currentFact(subjectType: string, subjectId: string, attribute: string): Promise<OrgFactRow | null> {
  const [row] = await db
    .select()
    .from(orgFacts)
    .where(
      and(
        eq(orgFacts.subjectType, subjectType),
        eq(orgFacts.subjectId, subjectId),
        eq(orgFacts.attribute, attribute),
        isNull(orgFacts.validTo),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** The fact believed true for (subject, attribute) at world-time `asOf`. */
export async function factAsOf(subjectType: string, subjectId: string, attribute: string, asOf: Date): Promise<OrgFactRow | null> {
  const [row] = await db
    .select()
    .from(orgFacts)
    .where(
      and(
        eq(orgFacts.subjectType, subjectType),
        eq(orgFacts.subjectId, subjectId),
        eq(orgFacts.attribute, attribute),
        lte(orgFacts.validFrom, asOf),
        or(isNull(orgFacts.validTo), gte(orgFacts.validTo, asOf)),
      ),
    )
    .orderBy(desc(orgFacts.validFrom))
    .limit(1);
  return row ?? null;
}

export async function factHistory(subjectType: string, subjectId: string, attribute: string): Promise<OrgFactRow[]> {
  return db
    .select()
    .from(orgFacts)
    .where(and(eq(orgFacts.subjectType, subjectType), eq(orgFacts.subjectId, subjectId), eq(orgFacts.attribute, attribute)))
    .orderBy(asc(orgFacts.validFrom));
}
