import { db } from "@/db";
import { commitmentEvents, commitments, meetingArtifacts, oneOnOnes } from "@/db/schema";
import { and, desc, eq, or } from "drizzle-orm";
import { EXTRACTION_REVIEW_THRESHOLD, extractFromActionItems, type RawActionItem } from "@/lib/commitmentExtraction";
import { renegotiate } from "@/lib/commitmentLedger";
import type { Commitment } from "@/lib/types";
import { audit } from "./autonomyRepo";

type CommitmentRow = typeof commitments.$inferSelect;

function toCommitment(row: CommitmentRow): Commitment {
  return {
    id: row.id,
    promisorId: row.promisorId,
    promiseeId: row.promiseeId,
    content: row.content,
    dueAt: row.dueAt,
    context: row.context as Commitment["context"],
    status: row.status as Commitment["status"],
    confirmed: row.confirmed,
    renegotiatedFromId: row.renegotiatedFromId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listCommitments() {
  const rows = await db.select().from(commitments).orderBy(desc(commitments.createdAt));
  return rows.map(toCommitment);
}

export async function listCommitmentsFor(personId: string) {
  const rows = await db
    .select()
    .from(commitments)
    .where(or(eq(commitments.promisorId, personId), eq(commitments.promiseeId, personId)))
    .orderBy(desc(commitments.createdAt));
  return rows.map(toCommitment);
}

export async function getCommitment(id: string) {
  const rows = await db.select().from(commitments).where(eq(commitments.id, id));
  return rows[0] ? toCommitment(rows[0]) : null;
}

/** Sweep: convert overdue open commitments to 'broken', recording a history event. */
export async function sweepOverdue(now: Date = new Date()) {
  const open = await db.select().from(commitments).where(eq(commitments.status, "open"));
  let brokenCount = 0;
  for (const row of open) {
    if (row.dueAt.getTime() < now.getTime()) {
      await db.update(commitments).set({ status: "broken", updatedAt: now }).where(eq(commitments.id, row.id));
      await db.insert(commitmentEvents).values({
        commitmentId: row.id,
        type: "broken",
        fromDueAt: row.dueAt,
        toDueAt: null,
        note: "auto-swept: due date passed with no renegotiation or completion",
        actorId: null,
      });
      brokenCount++;
    }
  }
  return brokenCount;
}

export async function markKept(id: string, actorId: string) {
  const current = await getCommitment(id);
  if (!current) throw new Error("commitment not found");
  await db.update(commitments).set({ status: "kept", updatedAt: new Date() }).where(eq(commitments.id, id));
  await db.insert(commitmentEvents).values({
    commitmentId: id,
    type: "kept",
    fromDueAt: current.dueAt,
    toDueAt: null,
    note: "marked kept",
    actorId,
  });
  await audit({ actorType: "human", actorId, action: "commitment.kept", entityType: "commitment", entityId: id });
}

export async function renegotiateCommitment(id: string, newDueAtIso: string, actorId: string, note: string) {
  const current = await getCommitment(id);
  if (!current) throw new Error("commitment not found");
  if (current.status !== "open") throw new Error(`cannot renegotiate a commitment with status '${current.status}'`);
  const { closedOriginal, newCommitment, event } = renegotiate(current, new Date(newDueAtIso), actorId, note);

  await db
    .update(commitments)
    .set({ status: closedOriginal.status, updatedAt: closedOriginal.updatedAt })
    .where(eq(commitments.id, id));

  await db.insert(commitments).values({
    id: newCommitment.id,
    promisorId: newCommitment.promisorId,
    promiseeId: newCommitment.promiseeId,
    content: newCommitment.content,
    dueAt: newCommitment.dueAt,
    context: newCommitment.context,
    status: newCommitment.status,
    confirmed: newCommitment.confirmed,
    renegotiatedFromId: newCommitment.renegotiatedFromId,
  });

  await db.insert(commitmentEvents).values({
    commitmentId: id,
    type: event.type,
    fromDueAt: event.fromDueAt,
    toDueAt: event.toDueAt,
    note: event.note,
    actorId: event.actorId,
  });

  await audit({
    actorType: "human",
    actorId,
    action: "commitment.renegotiated",
    entityType: "commitment",
    entityId: id,
    details: { newCommitmentId: newCommitment.id, fromDueAt: current.dueAt, toDueAt: newCommitment.dueAt, note },
  });

  return newCommitment;
}

export async function listEvents(commitmentId: string) {
  return db.select().from(commitmentEvents).where(eq(commitmentEvents.commitmentId, commitmentId)).orderBy(desc(commitmentEvents.createdAt));
}

export async function confirmCommitment(id: string, actorId: string) {
  await db.update(commitments).set({ confirmed: true, updatedAt: new Date() }).where(eq(commitments.id, id));
  await audit({ actorType: "human", actorId, action: "commitment.confirmed", entityType: "commitment", entityId: id });
}

export async function createCommitmentDraft(input: {
  promisorId: string;
  promiseeId: string;
  content: string;
  dueAt: Date;
  context: Record<string, unknown>;
  confirmed?: boolean;
}) {
  const [row] = await db
    .insert(commitments)
    .values({
      promisorId: input.promisorId,
      promiseeId: input.promiseeId,
      content: input.content,
      dueAt: input.dueAt,
      context: input.context,
      confirmed: input.confirmed ?? false,
    })
    .returning();
  await db.insert(commitmentEvents).values({ commitmentId: row.id, type: "created", toDueAt: row.dueAt, note: "extracted/created" });
  return toCommitment(row);
}

/**
 * Extraction pipeline entrypoint: pulls meeting artifacts (Part 42) and 1:1
 * raw commitments (Part 43), runs them through the extractor, and persists
 * them as UNCONFIRMED commitment drafts (confirmed=false) for human review.
 */
export async function runExtractionFromArtifacts(
  resolveNameToId: (name: string) => Promise<string | null>,
) {
  const created: Commitment[] = [];

  const meetings = await db.select().from(meetingArtifacts);
  for (const m of meetings) {
    const items = (m.actionItems as RawActionItem[]) ?? [];
    const extracted = extractFromActionItems(items, { sourceType: "meeting", sourceId: m.id, surface: "part42_meeting_artifact" }, m.occurredAt);
    for (const e of extracted) {
      if (e.confidence < EXTRACTION_REVIEW_THRESHOLD) continue;
      const promisorId = await resolveNameToId(e.promisorName);
      const promiseeId = await resolveNameToId(e.promiseeName);
      if (!promisorId || !promiseeId) continue;
      const row = await createCommitmentDraft({
        promisorId,
        promiseeId,
        content: e.content,
        dueAt: new Date(e.dueAtIso),
        context: { ...e.context, confidence: e.confidence },
        confirmed: false,
      });
      created.push(row);
    }
  }

  const ones = await db.select().from(oneOnOnes);
  for (const o of ones) {
    const items = (o.commitmentsRaw as RawActionItem[]) ?? [];
    const extracted = extractFromActionItems(items, { sourceType: "one_on_one", sourceId: o.id, surface: "part43_1on1" }, o.occurredAt);
    for (const e of extracted) {
      if (e.confidence < EXTRACTION_REVIEW_THRESHOLD) continue;
      const promisorId = await resolveNameToId(e.promisorName);
      const promiseeId = await resolveNameToId(e.promiseeName);
      if (!promisorId || !promiseeId) continue;
      const row = await createCommitmentDraft({
        promisorId,
        promiseeId,
        content: e.content,
        dueAt: new Date(e.dueAtIso),
        context: { ...e.context, confidence: e.confidence },
        confirmed: false,
      });
      created.push(row);
    }
  }

  return created;
}
