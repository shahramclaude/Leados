import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

// Must run before any schema below is constructed so OpenAPI generation
// (scripts/generate-api-spec.ts) can call `.openapi(...)` on them.
extendZodWithOpenApi(z);

/* ------------------------------------------------------------------ *
 * Shared envelopes
 * ------------------------------------------------------------------ */

export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    correlationId: z.string(),
  }),
});

export const PageMetaSchema = z.object({
  cursor: z.string().nullable(),
  hasMore: z.boolean(),
  limit: z.number().int(),
});

export function listResponseSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({ data: z.array(item), page: PageMetaSchema });
}

/* ------------------------------------------------------------------ *
 * Leads
 * ------------------------------------------------------------------ */

export const LeadStatusEnum = z.enum(["new", "contacted", "qualified", "won", "lost"]);

export const LeadSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  company: z.string().nullable(),
  status: LeadStatusEnum,
  score: z.number().int(),
  ownerId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const LeadCreateSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  company: z.string().max(200).optional(),
  status: LeadStatusEnum.optional(),
  score: z.number().int().min(0).max(100).optional(),
  ownerId: z.string().max(100).optional(),
});

export const LeadUpdateSchema = LeadCreateSchema.partial();

/* ------------------------------------------------------------------ *
 * Contacts
 * ------------------------------------------------------------------ */

export const ContactSchema = z.object({
  id: z.string().uuid(),
  leadId: z.string().uuid().nullable(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ContactCreateSchema = z.object({
  leadId: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
});

export const ContactUpdateSchema = ContactCreateSchema.partial();

/* ------------------------------------------------------------------ *
 * Deals
 * ------------------------------------------------------------------ */

export const DealStageEnum = z.enum(["open", "won", "lost"]);

export const DealSchema = z.object({
  id: z.string().uuid(),
  leadId: z.string().uuid().nullable(),
  title: z.string(),
  value: z.string(),
  stage: DealStageEnum,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const DealCreateSchema = z.object({
  leadId: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  value: z.number().min(0).optional(),
  stage: DealStageEnum.optional(),
});

export const DealUpdateSchema = DealCreateSchema.partial();

/* ------------------------------------------------------------------ *
 * Webhooks
 * ------------------------------------------------------------------ */

export const WebhookEventTypeEnum = z.enum([
  "lead.created",
  "lead.updated",
  "deal.won",
  "automation.run.completed",
]);

export const WebhookSubscriptionSchema = z.object({
  id: z.string().uuid(),
  url: z.string().url(),
  eventTypes: z.array(WebhookEventTypeEnum),
  status: z.enum(["active", "disabled"]),
  description: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const WebhookSubscriptionCreateSchema = z.object({
  url: z.string().url(),
  eventTypes: z.array(WebhookEventTypeEnum).min(1),
  description: z.string().max(300).optional(),
});

export const WebhookSubscriptionCreateResponseSchema = WebhookSubscriptionSchema.extend({
  secret: z.string().describe("Returned once, at creation time only. Store it securely."),
});

export const WebhookDeliverySchema = z.object({
  id: z.string().uuid(),
  subscriptionId: z.string().uuid(),
  eventType: z.string(),
  status: z.enum(["pending", "retrying", "success", "dead_letter"]),
  attempt: z.number().int(),
  maxAttempts: z.number().int(),
  lastStatusCode: z.number().int().nullable(),
  lastError: z.string().nullable(),
  payloadRedacted: z.record(z.string(), z.unknown()),
  deliveredAt: z.string().nullable(),
  nextAttemptAt: z.string().nullable(),
  createdAt: z.string(),
});

/* ------------------------------------------------------------------ *
 * Automation runs & playbooks
 * ------------------------------------------------------------------ */

export const AutomationRunStatusEnum = z.enum(["queued", "running", "succeeded", "failed"]);

export const AutomationRunSchema = z.object({
  id: z.string().uuid(),
  playbookId: z.string().uuid().nullable(),
  trigger: z.string(),
  status: AutomationRunStatusEnum,
  input: z.unknown().nullable(),
  output: z.unknown().nullable(),
  correlationId: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const AutomationRunTriggerSchema = z.object({
  playbookId: z.string().uuid(),
  input: z.record(z.string(), z.unknown()).optional(),
});

export const PlaybookStepSchema = z.object({
  type: z.string(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const PlaybookSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  steps: z.array(PlaybookStepSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/* ------------------------------------------------------------------ *
 * API keys (admin-only management)
 * ------------------------------------------------------------------ */

export const ScopeEnum = z.enum([
  "leads:read",
  "leads:write",
  "contacts:read",
  "contacts:write",
  "deals:read",
  "deals:write",
  "webhooks:read",
  "webhooks:write",
  "automation:read",
  "automation:write",
  "admin",
]);

export const ApiKeyCreateSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(ScopeEnum).min(1),
});

export const ApiKeyCreateResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  scopes: z.array(ScopeEnum),
  prefix: z.string(),
  apiKey: z.string().describe("Returned once, at creation time only."),
  createdAt: z.string(),
});

/* ------------------------------------------------------------------ *
 * Stats
 * ------------------------------------------------------------------ */

export const StatsSchema = z.object({
  leads: z.number().int(),
  contacts: z.number().int(),
  deals: z.number().int(),
  openDealsValue: z.string(),
  automationRuns: z.object({
    queued: z.number().int(),
    running: z.number().int(),
    succeeded: z.number().int(),
    failed: z.number().int(),
  }),
  webhooks: z.object({
    subscriptions: z.number().int(),
    pendingDeliveries: z.number().int(),
    deadLetters: z.number().int(),
  }),
  generatedAt: z.string(),
});
