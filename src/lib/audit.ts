import { createHash } from "node:crypto";
import { db } from "@/db";
import { auditEvents } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

/**
 * Tamper-evident audit chain (lite).
 *
 * Each event's hash = sha256(prevHash + canonical(payload)). Any event
 * delivered without the correct prevHash breaks the chain — a verifier can
 * walk the table and detect the exact row where tampering occurred.
 */
export async function appendAuditEvent(input: {
  orgId: string;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const [last] = await db
    .select({ hash: auditEvents.hash })
    .from(auditEvents)
    .where(eq(auditEvents.orgId, input.orgId))
    .orderBy(desc(auditEvents.createdAt))
    .limit(1);

  const prevHash = last?.hash ?? "GENESIS";
  const payload = JSON.stringify({
    orgId: input.orgId,
    actorId: input.actorId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    metadata: input.metadata ?? null,
    prevHash,
  });
  const hash = createHash("sha256").update(payload).digest("hex");

  const [row] = await db
    .insert(auditEvents)
    .values({
      orgId: input.orgId,
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? null,
      prevHash,
      hash,
    })
    .returning();

  return row;
}

/** Walk the chain in creation order and verify every link. */
export async function verifyAuditChain(orgId: string) {
  const rows = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.orgId, orgId))
    .orderBy(auditEvents.createdAt);

  let expectedPrev = "GENESIS";
  const breaks: string[] = [];
  for (const row of rows) {
    if (row.prevHash !== expectedPrev) breaks.push(row.id);
    const payload = JSON.stringify({
      orgId: row.orgId,
      actorId: row.actorId,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      metadata: row.metadata,
      prevHash: row.prevHash,
    });
    const recomputed = createHash("sha256").update(payload).digest("hex");
    if (recomputed !== row.hash) breaks.push(row.id);
    expectedPrev = row.hash;
  }
  return { valid: breaks.length === 0, breaks, count: rows.length };
}
