// Part 43 — Phase 1/3(d): manager-enablement layer with symmetry
// enforcement. Every datum a manager can see through this module is built
// FROM an item the person already marked `shared_with_manager` (or from a
// named policy extension in people.ts). The "person's own view of the same
// data" is exposed by the mirrored `*ForPersonSelf` functions so the two can
// be diffed in the symmetry test.

import { db } from "@/db";
import { managerNudges, oneOnOnes } from "@/db/schema";
import { findStalledSharedGoals, sharedGoalsForManagerView } from "@/lib/development";
import { newId } from "@/lib/ids";
import { sharedCommitmentsForManagerView } from "@/lib/coaching";
import { and, eq } from "drizzle-orm";

export type OneOnOne = typeof oneOnOnes.$inferSelect;
export type ManagerNudge = typeof managerNudges.$inferSelect;

export async function scheduleOneOnOne(params: {
  managerId: string;
  personId: string;
  scheduledAt: Date;
  cadenceDays?: number;
}): Promise<OneOnOne> {
  const [row] = await db
    .insert(oneOnOnes)
    .values({
      id: newId("1on1"),
      managerId: params.managerId,
      personId: params.personId,
      scheduledAt: params.scheduledAt,
      cadenceDays: params.cadenceDays ?? 14,
    })
    .returning();
  return row;
}

export async function listOneOnOnes(managerId: string, personId: string): Promise<OneOnOne[]> {
  return db.select().from(oneOnOnes).where(and(eq(oneOnOnes.managerId, managerId), eq(oneOnOnes.personId, personId)));
}

/** Generate "topics worth raising" nudges — ONLY from goals/commitments the
 * person has explicitly shared. Each nudge records its exact source row so
 * the symmetry test can confirm the person can see that same row. */
export async function generateNudgesForManager(managerId: string, personId: string): Promise<ManagerNudge[]> {
  const stalled = await findStalledSharedGoals(personId);
  const sharedCommitments = await sharedCommitmentsForManagerView(personId);
  const created: ManagerNudge[] = [];

  for (const goal of stalled) {
    const [row] = await db
      .insert(managerNudges)
      .values({
        id: newId("nudge"),
        managerId,
        personId,
        kind: "stalled_goal",
        message: `Growth goal "${goal.title}" looks ~6 weeks stalled — worth raising in your next 1:1.`,
        sourceTable: "growth_goals",
        sourceId: goal.id,
      })
      .returning();
    created.push(row);
  }

  const overdueCommitments = sharedCommitments.filter(
    (c) => c.status === "open" && c.dueDate && new Date(c.dueDate).getTime() < Date.now(),
  );
  for (const commitment of overdueCommitments) {
    const [row] = await db
      .insert(managerNudges)
      .values({
        id: newId("nudge"),
        managerId,
        personId,
        kind: "commitment_overdue",
        message: `Commitment "${commitment.title}" is past its date — ask how it's going, not why it slipped.`,
        sourceTable: "commitments",
        sourceId: commitment.id,
      })
      .returning();
    created.push(row);
  }

  return created;
}

export async function listNudgesForManager(managerId: string, personId: string): Promise<ManagerNudge[]> {
  return db.select().from(managerNudges).where(and(eq(managerNudges.managerId, managerId), eq(managerNudges.personId, personId)));
}

export async function acknowledgeNudge(nudgeId: string): Promise<void> {
  await db.update(managerNudges).set({ acknowledgedAt: new Date() }).where(eq(managerNudges.id, nudgeId));
}

// --- Symmetry views --------------------------------------------------

export type SymmetryItem = { surface: string; sourceTable: string; sourceId: string; summary: string };

/** Everything the manager can currently see about this person, flattened to
 * (sourceTable, sourceId) keys. */
export async function managerVisibleItems(managerId: string, personId: string): Promise<SymmetryItem[]> {
  const goals = await sharedGoalsForManagerView(personId);
  const commitmentsShared = await sharedCommitmentsForManagerView(personId);
  const nudges = await listNudgesForManager(managerId, personId);

  return [
    ...goals.map((g) => ({ surface: "growth_goal", sourceTable: "growth_goals", sourceId: g.id, summary: g.title })),
    ...commitmentsShared.map((c) => ({ surface: "commitment", sourceTable: "commitments", sourceId: c.id, summary: c.title })),
    ...nudges.map((n) => ({ surface: "nudge", sourceTable: n.sourceTable, sourceId: n.sourceId, summary: n.message })),
  ];
}

/** The person's own view of the SAME underlying rows (their full shared set,
 * regardless of whether a manager has generated a nudge from it yet). */
export async function personOwnEquivalentItems(personId: string): Promise<SymmetryItem[]> {
  const goals = await sharedGoalsForManagerView(personId);
  const commitmentsShared = await sharedCommitmentsForManagerView(personId);
  const stalled = await findStalledSharedGoals(personId);

  return [
    ...goals.map((g) => ({ surface: "growth_goal", sourceTable: "growth_goals", sourceId: g.id, summary: g.title })),
    ...commitmentsShared.map((c) => ({ surface: "commitment", sourceTable: "commitments", sourceId: c.id, summary: c.title })),
    ...stalled.map((g) => ({ surface: "nudge", sourceTable: "growth_goals", sourceId: g.id, summary: g.title })),
  ];
}
