// Event envelope (Part 01 lineage).
//
// EVERY write in LEADOS — human, agent, or LLM — must call `recordEvent`.
// This is the seam proven by tests/seams/envelope-on-write.test.ts. The
// envelope is hash-chained per org so tampering or silent deletion of a
// middle event breaks the chain (verifiable via `npm run audit:verify` and
// the /audit UI).

import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";

export type ActorType = "human" | "agent" | "llm" | "system";

export type RecordEventInput = {
  orgId: string;
  actorType: ActorType;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  payload: unknown;
};

function hashLink(prevHash: string | null, payload: unknown, input: RecordEventInput): string {
  const h = createHash("sha256");
  h.update(prevHash ?? "GENESIS");
  h.update(
    JSON.stringify({
      orgId: input.orgId,
      actorType: input.actorType,
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      payload,
    }),
  );
  return h.digest("hex");
}

export async function recordEvent(input: RecordEventInput) {
  const [last] = await db
    .select({ hash: events.hash })
    .from(events)
    .where(eq(events.orgId, input.orgId))
    .orderBy(desc(events.createdAt))
    .limit(1);

  const prevHash = last?.hash ?? null;
  const hash = hashLink(prevHash, input.payload, input);

  const [row] = await db
    .insert(events)
    .values({
      orgId: input.orgId,
      actorType: input.actorType,
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      payload: input.payload as object,
      prevHash,
      hash,
    })
    .returning();

  return row;
}

/** Re-derives the hash chain for an org and returns the first break, if any.
 * Used by scripts/audit-verify.mjs and the /audit page integrity banner. */
export async function verifyChain(orgId: string) {
  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.orgId, orgId)))
    .orderBy(events.createdAt);

  let prevHash: string | null = null;
  for (const row of rows) {
    const expected = hashLink(prevHash, row.payload, {
      orgId: row.orgId,
      actorType: row.actorType,
      actorId: row.actorId,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      payload: row.payload,
    });
    if (expected !== row.hash || row.prevHash !== prevHash) {
      return { ok: false, brokenAt: row.id, event: row };
    }
    prevHash = row.hash;
  }
  return { ok: true, checked: rows.length };
}
