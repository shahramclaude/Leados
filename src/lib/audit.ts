// Part 09-style append-only audit log. Every governance-relevant write in
// Part 46 (safe-channel access, dual-control decisions, recusals, red-flag
// detections, suppression attempts) goes through this one function so there
// is a single, consistent audit trail to inspect.

import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export interface AuditEntry {
  actorId?: number | null;
  actorRole?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | number | null;
  metadata?: Record<string, unknown>;
}

export async function recordAudit(entry: AuditEntry) {
  const [row] = await db
    .insert(auditLog)
    .values({
      actorId: entry.actorId ?? null,
      actorRole: entry.actorRole ?? null,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId == null ? null : String(entry.resourceId),
      metadata: entry.metadata ?? {},
    })
    .returning();
  return row;
}

export async function getAuditTrail(resourceType: string, resourceId: string | number) {
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.resourceType, resourceType))
    .orderBy(desc(auditLog.createdAt))
    .then((rows) => rows.filter((r) => r.resourceId === String(resourceId)));
}
