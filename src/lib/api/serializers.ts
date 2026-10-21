import type {
  accounts,
  auditLogs,
  automationRuns,
  events,
  extensions,
  leads,
  webhookDeliveries,
  webhookSubscriptions,
} from "@/db/schema";

export function serializeLead(row: typeof leads.$inferSelect) {
  return {
    id: row.id,
    orgId: row.orgId,
    accountId: row.accountId,
    name: row.name,
    email: row.email,
    company: row.company,
    stage: row.stage,
    score: row.score,
    ownerEmail: row.ownerEmail,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeAccount(row: typeof accounts.$inferSelect) {
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    domain: row.domain,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeEvent(row: typeof events.$inferSelect) {
  return {
    id: row.id,
    seq: row.seq,
    orgId: row.orgId,
    type: row.type,
    payload: row.payload,
    correlationId: row.correlationId,
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializeAuditLog(row: typeof auditLogs.$inferSelect) {
  return {
    id: row.id,
    orgId: row.orgId,
    tokenId: row.tokenId,
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    metadata: row.metadata,
    correlationId: row.correlationId,
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializeWebhookSubscription(row: typeof webhookSubscriptions.$inferSelect) {
  return {
    id: row.id,
    orgId: row.orgId,
    url: row.url,
    eventTypes: row.eventTypes,
    description: row.description,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeWebhookDelivery(row: typeof webhookDeliveries.$inferSelect) {
  return {
    id: row.id,
    subscriptionId: row.subscriptionId,
    eventType: row.eventType,
    status: row.status,
    attempt: row.attempt,
    maxAttempts: row.maxAttempts,
    nextAttemptAt: row.nextAttemptAt.toISOString(),
    lastAttemptAt: row.lastAttemptAt ? row.lastAttemptAt.toISOString() : null,
    responseStatus: row.responseStatus,
    responseBodySnippet: row.responseBodySnippet,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
  };
}

export function serializeAutomationRun(row: typeof automationRuns.$inferSelect) {
  return {
    id: row.id,
    orgId: row.orgId,
    playbookKey: row.playbookKey,
    status: row.status,
    input: row.input,
    output: row.output,
    error: row.error,
    correlationId: row.correlationId,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
  };
}

export function serializeExtension(row: typeof extensions.$inferSelect) {
  return {
    id: row.id,
    orgId: row.orgId,
    kind: row.kind,
    type: row.type,
    key: row.key,
    config: row.config,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
