// Board-level conflict registry (Part 46) + independence checks used by the
// resolution voting hard-stop.

import { db } from "@/db";
import { conflictsRegister } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { appendAuditEntry } from "./auditChain";

export async function declareConflict(params: {
  directorId: number;
  matter: string;
  natureOfInterest: string;
  recusalRequired?: boolean;
}) {
  const [row] = await db
    .insert(conflictsRegister)
    .values({
      directorId: params.directorId,
      matter: params.matter,
      natureOfInterest: params.natureOfInterest,
      recusalRequired: params.recusalRequired ?? false,
      status: params.recusalRequired ? "recusal_required" : "declared",
    })
    .returning();

  await appendAuditEntry({
    actorId: params.directorId,
    action: "conflict.declared",
    entityType: "conflict",
    entityId: row.id,
    payload: { matter: params.matter },
  });

  return row;
}

/** Finds an active (not resolved) conflict for a director that matches a
 * resolution's matter reference, using a simple substring match — good
 * enough to force a human cross-check at vote time, not a legal opinion. */
const ACTIVE_CONFLICT_STATUSES = new Set(["declared", "recusal_required"]);

export async function findActiveConflict(directorId: number, matterRef: string) {
  const rows = (
    await db.select().from(conflictsRegister).where(eq(conflictsRegister.directorId, directorId))
  ).filter((r) => ACTIVE_CONFLICT_STATUSES.has(r.status));
  const normalizedMatter = matterRef.toLowerCase();
  return rows.find(
    (r) =>
      r.matter.toLowerCase().length > 0 &&
      (normalizedMatter.includes(r.matter.toLowerCase()) ||
        r.matter.toLowerCase().includes(normalizedMatter)),
  );
}

export async function listConflictsForDirector(directorId: number) {
  return db.select().from(conflictsRegister).where(eq(conflictsRegister.directorId, directorId));
}

export async function waiveConflict(conflictId: number, waivedByBoard = true) {
  const [row] = await db
    .update(conflictsRegister)
    .set({ status: waivedByBoard ? "waived_by_board" : "resolved" })
    .where(eq(conflictsRegister.id, conflictId))
    .returning();

  await appendAuditEntry({
    action: "conflict.waived",
    entityType: "conflict",
    entityId: conflictId,
    payload: { waivedByBoard },
  });

  return row;
}
