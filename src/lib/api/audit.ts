import { db } from "@/db";
import { auditLogs } from "@/db/schema";

export async function writeAudit(params: {
  orgId: string;
  tokenId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  correlationId: string;
}) {
  await db.insert(auditLogs).values({
    orgId: params.orgId,
    tokenId: params.tokenId ?? null,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId ?? null,
    metadata: params.metadata ?? {},
    correlationId: params.correlationId,
  });
}
