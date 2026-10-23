// Part 09 reconstruction: people scoping + the "parity rule" (symmetry
// principle) — whatever a manager can see about a person, that person can
// see too, unless an explicit, named policy extension says otherwise.
// Not present to read in this sandbox (src/lib was empty); reconstructed
// minimally and used consistently by every Part 43 surface below.

import { db } from "@/db";
import { people } from "@/db/schema";
import { eq } from "drizzle-orm";

export type Person = typeof people.$inferSelect;

export async function getPerson(id: string): Promise<Person | undefined> {
  const rows = await db.select().from(people).where(eq(people.id, id)).limit(1);
  return rows[0];
}

export async function listPeople(): Promise<Person[]> {
  return db.select().from(people);
}

export async function directReports(managerId: string): Promise<Person[]> {
  return db.select().from(people).where(eq(people.managerId, managerId));
}

export function isManagerOf(manager: Person, person: Person): boolean {
  return person.managerId === manager.id;
}

/**
 * Scoping guard used by every API route: can `actor` read data belonging to
 * `targetPersonId`? Self always can. A manager can only ever reach their
 * direct report's SHARED surfaces (enforced again, item-by-item, by the
 * symmetry helpers in managerEnablement.ts) — this function is the coarse
 * perimeter, not the fine-grained visibility rule.
 */
export function canActOnPerson(
  actor: Person,
  targetPersonId: string,
  targetManagerId: string | null,
): boolean {
  if (actor.id === targetPersonId) return true;
  if (actor.role === "manager" && targetManagerId === actor.id) return true;
  if (actor.role === "admin") return true;
  return false;
}

/** Named policy extensions to the symmetry (parity) rule. Anything NOT
 * listed here that a manager can see must also be visible to the person —
 * enforced by the symmetry test in scripts/test-symmetry.ts. */
export const SYMMETRY_POLICY_EXTENSIONS = [
  {
    id: "aggregate_fairness_reporting",
    description:
      "Org-level fairness/disparity reports may show aggregate counts (n>=5) the individual contributor view does not render as a dashboard, " +
      "because the aggregate contains other people's data too. The person's OWN rows inside that aggregate remain fully visible to them.",
  },
] as const;
