import { db } from "@/db";
import { commitmentEvents, commitments, decisions, delegations, loops, meetingArtifacts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { computeLoopHealth, dueForRevival, type Loop } from "@/lib/loopClosure";
import { audit } from "./autonomyRepo";

function toLoop(row: typeof loops.$inferSelect): Loop {
  return {
    id: row.id,
    surfaceType: row.surfaceType as Loop["surfaceType"],
    surfaceRef: row.surfaceRef as Record<string, unknown>,
    ownerId: row.ownerId,
    nextStep: row.nextStep,
    status: row.status as Loop["status"],
    parkedReason: row.parkedReason,
    parkedUntil: row.parkedUntil,
    openedAt: row.openedAt,
    closedAt: row.closedAt,
  };
}

export async function listLoops() {
  const rows = await db.select().from(loops);
  return rows.map(toLoop);
}

/**
 * Derives the current loop set from live surfaces (commitments, decisions,
 * meetings, delegations) and syncs the `loops` table so health metrics stay
 * current. Open commitments/decisions/delegations without a concrete next
 * step surface as invariant violations unless explicitly parked.
 */
export async function syncLoopsFromSurfaces() {
  const openCommitments = await db.select().from(commitments).where(eq(commitments.status, "open"));
  const stagnatingDecisions = await db.select().from(decisions);
  const meetingRows = await db.select().from(meetingArtifacts);
  const delegationRows = await db.select().from(delegations);
  const existing = await db.select().from(loops);
  const existingBySurface = new Map(existing.map((l) => [`${l.surfaceType}:${JSON.stringify(l.surfaceRef)}`, l]));

  let createdCount = 0;

  for (const c of openCommitments) {
    const key = `commitment:${JSON.stringify({ commitmentId: c.id })}`;
    if (existingBySurface.has(key)) continue;
    await db.insert(loops).values({
      surfaceType: "commitment",
      surfaceRef: { commitmentId: c.id },
      ownerId: c.promisorId,
      nextStep: c.content,
      status: "open",
      openedAt: c.createdAt,
    });
    createdCount++;
  }

  for (const d of stagnatingDecisions) {
    if (d.status === "decided") continue;
    const key = `decision:${JSON.stringify({ decisionId: d.id })}`;
    if (existingBySurface.has(key)) continue;
    await db.insert(loops).values({
      surfaceType: "decision",
      surfaceRef: { decisionId: d.id },
      ownerId: d.ownerId,
      nextStep: null, // decisions don't carry a next step by default — surfaces as a violation until set or parked
      status: "open",
      openedAt: d.createdAt,
    });
    createdCount++;
  }

  for (const m of meetingRows) {
    const items = Array.isArray(m.actionItems) ? m.actionItems : [];
    if (items.length > 0) continue; // has actions, not an open loop by itself
    const key = `meeting:${JSON.stringify({ meetingId: m.id })}`;
    if (existingBySurface.has(key)) continue;
    await db.insert(loops).values({
      surfaceType: "meeting",
      surfaceRef: { meetingId: m.id },
      ownerId: m.ownerId,
      nextStep: null,
      status: "open",
      openedAt: m.occurredAt,
    });
    createdCount++;
  }

  for (const d of delegationRows) {
    if (d.status === "completed" || d.status === "declined") continue;
    const key = `delegation:${JSON.stringify({ delegationId: d.id })}`;
    if (existingBySurface.has(key)) continue;
    await db.insert(loops).values({
      surfaceType: "delegation",
      surfaceRef: { delegationId: d.id },
      ownerId: d.delegatorId,
      nextStep: d.task,
      status: "open",
      openedAt: d.createdAt,
    });
    createdCount++;
  }

  return createdCount;
}

export async function parkLoop(id: string, reason: string, actorId: string, untilIso?: string) {
  await db
    .update(loops)
    .set({ status: "parked", parkedReason: reason, parkedUntil: untilIso ? new Date(untilIso) : null })
    .where(eq(loops.id, id));
  await audit({ actorType: "human", actorId, action: "loop.parked", entityType: "loop", entityId: id, details: { reason, untilIso } });
}

export async function closeLoop(id: string, actorId: string) {
  await db.update(loops).set({ status: "closed", closedAt: new Date() }).where(eq(loops.id, id));
  await audit({ actorType: "human", actorId, action: "loop.closed", entityType: "loop", entityId: id });
}

export async function setNextStep(id: string, nextStep: string, ownerId: string, actorId: string) {
  await db.update(loops).set({ nextStep, ownerId }).where(eq(loops.id, id));
  await audit({ actorType: "human", actorId, action: "loop.next_step_set", entityType: "loop", entityId: id, details: { nextStep, ownerId } });
}

export async function health(now: Date = new Date()) {
  const rows = await listLoops();
  return computeLoopHealth(rows, now);
}

export async function dueRevivals(now: Date = new Date()) {
  const rows = await listLoops();
  return rows.filter((l) => dueForRevival(l, now));
}
