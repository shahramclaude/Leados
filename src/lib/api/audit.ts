import { db } from "@/db";
import { auditLog } from "@/db/schema";

export async function recordAudit(entry: {
  actor: string;
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  correlationId?: string;
}) {
  await db.insert(auditLog).values({
    actor: entry.actor,
    action: entry.action,
    resource: entry.resource,
    resourceId: entry.resourceId,
    metadata: entry.metadata,
    correlationId: entry.correlationId,
  });
}
