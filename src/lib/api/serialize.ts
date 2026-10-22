import type {
  automationRuns,
  contacts,
  deals,
  leads,
  playbooks,
  webhookDeliveries,
  webhookSubscriptions,
} from "@/db/schema";
import { redactPayload } from "../webhooks/worker";

type Row<T> = T extends { $inferSelect: infer S } ? S : never;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toLead(row: Row<typeof leads>) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    company: row.company,
    status: row.status,
    score: row.score,
    ownerId: row.ownerId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toContact(row: Row<typeof contacts>) {
  return {
    id: row.id,
    leadId: row.leadId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toDeal(row: Row<typeof deals>) {
  return {
    id: row.id,
    leadId: row.leadId,
    title: row.title,
    value: row.value,
    stage: row.stage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toWebhookSubscription(row: Row<typeof webhookSubscriptions>) {
  return {
    id: row.id,
    url: row.url,
    eventTypes: row.eventTypes,
    status: row.status,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toWebhookDelivery(row: Row<typeof webhookDeliveries>) {
  return {
    id: row.id,
    subscriptionId: row.subscriptionId,
    eventType: row.eventType,
    status: row.status,
    attempt: row.attempt,
    maxAttempts: row.maxAttempts,
    lastStatusCode: row.lastStatusCode,
    lastError: row.lastError,
    payloadRedacted: redactPayload(row.payload),
    deliveredAt: iso(row.deliveredAt),
    nextAttemptAt: iso(row.nextAttemptAt),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toAutomationRun(row: Row<typeof automationRuns>) {
  return {
    id: row.id,
    playbookId: row.playbookId,
    trigger: row.trigger,
    status: row.status,
    input: row.input ?? null,
    output: row.output ?? null,
    correlationId: row.correlationId,
    startedAt: iso(row.startedAt),
    finishedAt: iso(row.finishedAt),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toPlaybook(row: Row<typeof playbooks>) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    steps: row.steps,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
