// =============================================================================
// LEADOS kernel — immutable audit log
// =============================================================================
// Append-only by convention: no update/delete helper is exported, and no API
// route exposes one either. Every agent action — executed, rejected, or
// skipped — gets an audit row with actor, reason, and a rollback handle when
// one exists.

import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { desc } from "drizzle-orm";
import type { RiskClass } from "./types";

export interface AuditEntryInput {
  actor: string;
  action: string;
  subjectType: string;
  subjectId: string;
  reason: string;
  riskClass?: RiskClass;
  rollbackHandle?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordAudit(entry: AuditEntryInput): Promise<void> {
  await db.insert(auditLog).values({
    actor: entry.actor,
    action: entry.action,
    subjectType: entry.subjectType,
    subjectId: entry.subjectId,
    reason: entry.reason,
    riskClass: entry.riskClass ?? "low",
    rollbackHandle: entry.rollbackHandle ?? null,
    metadata: entry.metadata ?? {},
  });
}

export async function listAuditLog(limit = 100) {
  return db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit);
}
