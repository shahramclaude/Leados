// DB rows -> wire DTOs (Date -> ISO string, strip internal-only columns).
import type { decisions, findings, runs, webhookDeliveries, webhookSubscriptions } from "@/db/schema";

type Row<T> = T extends (infer U)[] ? never : T;

export function toDecisionDTO(row: typeof decisions.$inferSelect) {
  return {
    id: row.id,
    orgId: row.orgId,
    title: row.title,
    status: row.status,
    owner: row.owner,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toFindingDTO(row: typeof findings.$inferSelect) {
  return {
    id: row.id,
    orgId: row.orgId,
    decisionId: row.decisionId,
    summary: row.summary,
    severity: row.severity,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toRunDTO(row: typeof runs.$inferSelect) {
  return {
    id: row.id,
    orgId: row.orgId,
    type: row.type,
    status: row.status,
    input: row.input,
    output: row.output,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

export function toWebhookSubscriptionDTO(row: typeof webhookSubscriptions.$inferSelect) {
  return {
    id: row.id,
    orgId: row.orgId,
    url: row.url,
    eventTypes: row.eventTypes,
    active: row.active,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toWebhookDeliveryDTO(row: typeof webhookDeliveries.$inferSelect) {
  return {
    id: row.id,
    subscriptionId: row.subscriptionId,
    eventType: row.eventType,
    status: row.status,
    attempt: row.attempt,
    maxAttempts: row.maxAttempts,
    responseStatus: row.responseStatus,
    nextRetryAt: row.nextRetryAt ? row.nextRetryAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
  };
}

export type { Row };
