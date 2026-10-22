// src/lib/platform/mdm/dedupActions.ts
//
// Human confirmation workflow for ambiguous entity-resolution candidates.
// Confirm/reject/undo are the only ways a `pending_review` candidate is ever
// resolved — there is no code path that promotes a pending candidate to
// "merged" without one of these explicit, audited actions.
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { dedupCandidates, entities, entityLinks, rawRecords, connectors as connectorsTable, auditLog } from "@/db/schema";
import { buildGoldenRecord, type SourcedRecord } from "./golden";
import { recordLineage } from "../lineage/store";
import { emitEvent } from "@/lib/dbEvents";
import type { NormalizedLead } from "../types";

export const UNDO_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — documented, not infinite

export class DedupActionError extends Error {}

async function rebuildFromLinks(entityId: string) {
  const links = await db.select().from(entityLinks).where(eq(entityLinks.entityId, entityId));
  const sources: SourcedRecord[] = [];
  for (const l of links) {
    const [rr] = await db.select().from(rawRecords).where(eq(rawRecords.id, l.rawRecordId));
    if (!rr) continue;
    const [c] = await db.select().from(connectorsTable).where(eq(connectorsTable.id, rr.connectorId));
    sources.push({
      connectorId: rr.connectorId,
      rawRecordId: rr.id,
      precedenceRank: c?.precedenceRank ?? 999,
      record: rr.normalized as unknown as NormalizedLead,
    });
  }
  return sources;
}

export async function confirmCandidate(candidateId: string, actor: string) {
  const [candidate] = await db.select().from(dedupCandidates).where(eq(dedupCandidates.id, candidateId));
  if (!candidate) throw new DedupActionError("Candidate not found.");
  if (candidate.status !== "pending") throw new DedupActionError(`Candidate is already ${candidate.status}.`);

  const [entity] = await db.select().from(entities).where(eq(entities.id, candidate.entityId));
  if (!entity) throw new DedupActionError("Target entity no longer exists.");

  // Snapshot BEFORE mutating, so undo is a real, data-backed operation.
  const preMergeSnapshot = {
    goldenRecord: entity.goldenRecord,
    fieldProvenance: entity.fieldProvenance,
    sourcePrecedence: entity.sourcePrecedence,
  };

  await db.insert(entityLinks).values({
    id: randomUUID(),
    entityId: candidate.entityId,
    rawRecordId: candidate.rawRecordId,
    confidence: String(candidate.score),
    linkMethod: "human_confirmed",
  });

  const sources = await rebuildFromLinks(candidate.entityId);
  const { goldenRecord, fieldProvenance, conflicts } = buildGoldenRecord(sources);
  const distinctConnectors = Array.from(new Set(sources.map((s) => `${s.connectorId}:${s.precedenceRank}`))).map((s) => {
    const [connectorId, rank] = s.split(":");
    return { connectorId, precedenceRank: Number(rank) };
  });

  await db
    .update(entities)
    .set({
      goldenRecord: goldenRecord as unknown as Record<string, unknown>,
      fieldProvenance: fieldProvenance as unknown as Record<string, unknown>,
      sourcePrecedence: distinctConnectors,
      updatedAt: new Date(),
    })
    .where(eq(entities.id, candidate.entityId));

  await db
    .update(dedupCandidates)
    .set({ status: "confirmed", decidedBy: actor, decidedAt: new Date(), preMergeSnapshot })
    .where(eq(dedupCandidates.id, candidateId));

  const [rr] = await db.select().from(rawRecords).where(eq(rawRecords.id, candidate.rawRecordId));
  await recordLineage({
    sourceRefTable: "raw_records",
    sourceRefId: candidate.rawRecordId,
    sourceLabel: `Human-confirmed merge (raw record ${candidate.rawRecordId})`,
    transformLabel: "mdm-human-confirmed-merge:v1",
    transformMetadata: { candidateId, actor, score: candidate.score, conflicts },
    projectionRefTable: "entities",
    projectionRefId: candidate.entityId,
    projectionLabel: "entities.goldenRecord",
    surfaces: ["leadDetail", "leadList"],
  });

  await db.insert(auditLog).values({
    id: randomUUID(),
    actor,
    action: "dedup.confirm",
    targetTable: "dedup_candidates",
    targetId: candidateId,
    details: { entityId: candidate.entityId, rawRecordId: candidate.rawRecordId, score: candidate.score, conflicts },
  });
  await emitEvent("dedup.confirmed", { candidateId, entityId: candidate.entityId });

  return { entityId: candidate.entityId, rawRecordExternalId: rr?.externalId ?? null };
}

export async function rejectCandidate(candidateId: string, actor: string) {
  const [candidate] = await db.select().from(dedupCandidates).where(eq(dedupCandidates.id, candidateId));
  if (!candidate) throw new DedupActionError("Candidate not found.");
  if (candidate.status !== "pending") throw new DedupActionError(`Candidate is already ${candidate.status}.`);

  const [rr] = await db.select().from(rawRecords).where(eq(rawRecords.id, candidate.rawRecordId));
  if (!rr) throw new DedupActionError("Underlying raw record no longer exists.");
  const [connectorRow] = await db.select().from(connectorsTable).where(eq(connectorsTable.id, rr.connectorId));

  // Rejected as a duplicate => it is its own distinct entity.
  const normalized = rr.normalized as unknown as NormalizedLead;
  const { goldenRecord, fieldProvenance } = buildGoldenRecord([
    { connectorId: rr.connectorId, rawRecordId: rr.id, precedenceRank: connectorRow?.precedenceRank ?? 999, record: normalized },
  ]);
  const newEntityId = randomUUID();
  await db.insert(entities).values({
    id: newEntityId,
    entityType: normalized.entityType,
    goldenRecord: goldenRecord as unknown as Record<string, unknown>,
    sourcePrecedence: [{ connectorId: rr.connectorId, precedenceRank: connectorRow?.precedenceRank ?? 999 }],
    fieldProvenance: fieldProvenance as unknown as Record<string, unknown>,
  });
  await db.insert(entityLinks).values({
    id: randomUUID(),
    entityId: newEntityId,
    rawRecordId: rr.id,
    confidence: "1.0",
    linkMethod: "initial",
  });

  await db
    .update(dedupCandidates)
    .set({ status: "rejected", decidedBy: actor, decidedAt: new Date() })
    .where(eq(dedupCandidates.id, candidateId));

  await recordLineage({
    sourceRefTable: "raw_records",
    sourceRefId: rr.id,
    sourceLabel: `Human-rejected duplicate -> new entity (raw record ${rr.id})`,
    transformLabel: "mdm-human-rejected-merge:v1",
    transformMetadata: { candidateId, actor },
    projectionRefTable: "entities",
    projectionRefId: newEntityId,
    projectionLabel: "entities.goldenRecord",
    surfaces: ["leadDetail", "leadList"],
  });

  await db.insert(auditLog).values({
    id: randomUUID(),
    actor,
    action: "dedup.reject",
    targetTable: "dedup_candidates",
    targetId: candidateId,
    details: { newEntityId },
  });
  await emitEvent("dedup.rejected", { candidateId, newEntityId });

  return { newEntityId };
}

/** Real undo path: restores the pre-merge golden record and splits the raw record back out into its own entity. */
export async function undoMerge(candidateId: string, actor: string) {
  const [candidate] = await db.select().from(dedupCandidates).where(eq(dedupCandidates.id, candidateId));
  if (!candidate) throw new DedupActionError("Candidate not found.");
  if (candidate.status !== "confirmed") throw new DedupActionError("Only a confirmed merge can be undone.");
  if (!candidate.decidedAt) throw new DedupActionError("Missing decision timestamp; cannot verify undo window.");
  if (Date.now() - new Date(candidate.decidedAt).getTime() > UNDO_WINDOW_MS) {
    throw new DedupActionError(
      `Undo window (${UNDO_WINDOW_MS / (24 * 60 * 60 * 1000)} days) has expired. Use a manual correction instead of undo.`
    );
  }
  if (!candidate.preMergeSnapshot) throw new DedupActionError("No pre-merge snapshot recorded; cannot safely undo.");

  const snapshot = candidate.preMergeSnapshot as {
    goldenRecord: Record<string, unknown>;
    fieldProvenance: Record<string, unknown>;
    sourcePrecedence: unknown;
  };

  await db
    .update(entities)
    .set({
      goldenRecord: snapshot.goldenRecord,
      fieldProvenance: snapshot.fieldProvenance,
      sourcePrecedence: snapshot.sourcePrecedence as Array<Record<string, unknown>>,
      updatedAt: new Date(),
    })
    .where(eq(entities.id, candidate.entityId));

  // Remove the link created at confirm time so the raw record is no longer attached to the entity.
  const links = await db.select().from(entityLinks).where(eq(entityLinks.entityId, candidate.entityId));
  const linkToRemove = links.find((l) => l.rawRecordId === candidate.rawRecordId && l.linkMethod === "human_confirmed");
  if (linkToRemove) {
    await db.delete(entityLinks).where(eq(entityLinks.id, linkToRemove.id));
  }

  // Give the detached raw record its own entity again so it isn't orphaned.
  const [rr] = await db.select().from(rawRecords).where(eq(rawRecords.id, candidate.rawRecordId));
  let newEntityId: string | null = null;
  if (rr) {
    const [connectorRow] = await db.select().from(connectorsTable).where(eq(connectorsTable.id, rr.connectorId));
    const normalized = rr.normalized as unknown as NormalizedLead;
    const { goldenRecord, fieldProvenance } = buildGoldenRecord([
      { connectorId: rr.connectorId, rawRecordId: rr.id, precedenceRank: connectorRow?.precedenceRank ?? 999, record: normalized },
    ]);
    newEntityId = randomUUID();
    await db.insert(entities).values({
      id: newEntityId,
      entityType: normalized.entityType,
      goldenRecord: goldenRecord as unknown as Record<string, unknown>,
      sourcePrecedence: [{ connectorId: rr.connectorId, precedenceRank: connectorRow?.precedenceRank ?? 999 }],
      fieldProvenance: fieldProvenance as unknown as Record<string, unknown>,
    });
    await db.insert(entityLinks).values({
      id: randomUUID(),
      entityId: newEntityId,
      rawRecordId: rr.id,
      confidence: "1.0",
      linkMethod: "initial",
    });
  }

  await db
    .update(dedupCandidates)
    .set({ status: "rejected", decidedBy: `${actor} (undo)`, decidedAt: new Date() })
    .where(eq(dedupCandidates.id, candidateId));

  await db.insert(auditLog).values({
    id: randomUUID(),
    actor,
    action: "dedup.undo",
    targetTable: "dedup_candidates",
    targetId: candidateId,
    details: { restoredEntityId: candidate.entityId, splitOutEntityId: newEntityId },
  });
  await emitEvent("dedup.unmerged", { candidateId, entityId: candidate.entityId, newEntityId });

  return { entityId: candidate.entityId, newEntityId };
}
