import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

// ---------------------------------------------------------------------------
// Single source of truth: these schemas are imported directly by the route
// handlers (runtime validation) AND by scripts/generate-openapi.ts +
// scripts/generate-sdk.ts (static generation). There is no separate
// hand-maintained copy to drift out of sync.
// ---------------------------------------------------------------------------

export const ErrorEnvelopeSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: "NOT_FOUND" }),
      message: z.string(),
      details: z.unknown().optional(),
      correlationId: z.string(),
    }),
  })
  .openapi("ErrorEnvelope");

export const PageMetaSchema = z
  .object({
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
    limit: z.number().int(),
  })
  .openapi("PageMeta");

export const LeadStageSchema = z.enum(["new", "qualified", "engaged", "won", "lost"]).openapi("LeadStage");

export const LeadSchema = z
  .object({
    id: z.string().uuid(),
    orgId: z.string().uuid(),
    accountId: z.string().uuid().nullable(),
    name: z.string(),
    email: z.string().email(),
    company: z.string().nullable(),
    stage: LeadStageSchema,
    score: z.number().int(),
    ownerEmail: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Lead");

export const CreateLeadSchema = z
  .object({
    name: z.string().min(1),
    email: z.string().email(),
    company: z.string().optional(),
    accountId: z.string().uuid().optional(),
    stage: LeadStageSchema.optional(),
    ownerEmail: z.string().email().optional(),
  })
  .openapi("CreateLeadInput");

export const UpdateLeadSchema = CreateLeadSchema.partial().openapi("UpdateLeadInput");

export const LeadListSchema = z.object({ data: z.array(LeadSchema), meta: PageMetaSchema }).openapi("LeadList");

export const AccountSchema = z
  .object({
    id: z.string().uuid(),
    orgId: z.string().uuid(),
    name: z.string(),
    domain: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Account");

export const CreateAccountSchema = z
  .object({ name: z.string().min(1), domain: z.string().optional() })
  .openapi("CreateAccountInput");

export const UpdateAccountSchema = CreateAccountSchema.partial().openapi("UpdateAccountInput");

export const AccountListSchema = z
  .object({ data: z.array(AccountSchema), meta: PageMetaSchema })
  .openapi("AccountList");

export const EventSchema = z
  .object({
    id: z.string().uuid(),
    seq: z.number().int(),
    orgId: z.string().uuid(),
    type: z.string(),
    payload: z.unknown(),
    correlationId: z.string(),
    createdAt: z.string(),
  })
  .openapi("Event");

export const EventListSchema = z.object({ data: z.array(EventSchema), meta: PageMetaSchema }).openapi("EventList");

export const AuditLogSchema = z
  .object({
    id: z.string().uuid(),
    orgId: z.string().uuid(),
    tokenId: z.string().uuid().nullable(),
    action: z.string(),
    resourceType: z.string(),
    resourceId: z.string().nullable(),
    metadata: z.unknown(),
    correlationId: z.string(),
    createdAt: z.string(),
  })
  .openapi("AuditLog");

export const AuditLogListSchema = z
  .object({ data: z.array(AuditLogSchema), meta: PageMetaSchema })
  .openapi("AuditLogList");

export const TokenScopeSchema = z
  .enum([
    "leads:read",
    "leads:write",
    "accounts:read",
    "accounts:write",
    "events:read",
    "stream:read",
    "webhooks:read",
    "webhooks:write",
    "automations:read",
    "automations:write",
    "extensions:read",
    "extensions:write",
    "audit:read",
    "tokens:admin",
  ])
  .openapi("TokenScope");

export const CreateTokenSchema = z
  .object({
    name: z.string().min(1),
    scopes: z.array(TokenScopeSchema).default([]),
    isAdmin: z.boolean().default(false),
    rateLimitPerMinute: z.number().int().min(1).max(10_000).default(120),
  })
  .openapi("CreateTokenInput");

export const TokenSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    tokenPrefix: z.string(),
    scopes: z.array(TokenScopeSchema),
    isAdmin: z.boolean(),
    rateLimitPerMinute: z.number().int(),
    createdAt: z.string(),
    revokedAt: z.string().nullable(),
  })
  .openapi("Token");

export const CreateTokenResponseSchema = TokenSchema.extend({
  secret: z.string().openapi({ description: "Raw bearer token value — shown exactly once." }),
}).openapi("CreateTokenResponse");

export const TokenListSchema = z.object({ data: z.array(TokenSchema), meta: PageMetaSchema }).openapi("TokenList");

export const WebhookSubscriptionSchema = z
  .object({
    id: z.string().uuid(),
    orgId: z.string().uuid(),
    url: z.string().url(),
    eventTypes: z.array(z.string()),
    description: z.string().nullable(),
    active: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("WebhookSubscription");

export const CreateWebhookSubscriptionSchema = z
  .object({
    url: z.string().url(),
    eventTypes: z.array(z.string()).min(1),
    description: z.string().optional(),
  })
  .openapi("CreateWebhookSubscriptionInput");

export const UpdateWebhookSubscriptionSchema = z
  .object({
    url: z.string().url().optional(),
    eventTypes: z.array(z.string()).min(1).optional(),
    description: z.string().optional(),
    active: z.boolean().optional(),
  })
  .openapi("UpdateWebhookSubscriptionInput");

export const CreateWebhookSubscriptionResponseSchema = WebhookSubscriptionSchema.extend({
  secret: z.string().openapi({ description: "Shared secret for HMAC verification — shown exactly once." }),
}).openapi("CreateWebhookSubscriptionResponse");

export const WebhookSubscriptionListSchema = z
  .object({ data: z.array(WebhookSubscriptionSchema), meta: PageMetaSchema })
  .openapi("WebhookSubscriptionList");

export const WebhookDeliverySchema = z
  .object({
    id: z.string().uuid(),
    subscriptionId: z.string().uuid(),
    eventType: z.string(),
    status: z.enum(["pending", "success", "failed", "dead_letter"]),
    attempt: z.number().int(),
    maxAttempts: z.number().int(),
    nextAttemptAt: z.string(),
    lastAttemptAt: z.string().nullable(),
    responseStatus: z.number().int().nullable(),
    responseBodySnippet: z.string().nullable().openapi({ description: "Redacted per data handling policy." }),
    errorMessage: z.string().nullable(),
    createdAt: z.string(),
    deliveredAt: z.string().nullable(),
  })
  .openapi("WebhookDelivery");

export const WebhookDeliveryListSchema = z
  .object({ data: z.array(WebhookDeliverySchema), meta: PageMetaSchema })
  .openapi("WebhookDeliveryList");

export const TestFireResponseSchema = z
  .object({ deliveryId: z.string().uuid(), status: z.string(), responseStatus: z.number().int().nullable() })
  .openapi("TestFireResponse");

export const AutomationPlaybookSchema = z
  .object({ key: z.string(), description: z.string(), steps: z.array(z.string()), inputSchemaDescription: z.string() })
  .openapi("AutomationPlaybook");

export const AutomationPlaybookListSchema = z
  .object({ data: z.array(AutomationPlaybookSchema) })
  .openapi("AutomationPlaybookList");

export const TriggerRunSchema = z.object({ input: z.record(z.string(), z.unknown()).default({}) }).openapi("TriggerRunInput");

export const AutomationRunSchema = z
  .object({
    id: z.string().uuid(),
    orgId: z.string().uuid(),
    playbookKey: z.string(),
    status: z.enum(["queued", "running", "succeeded", "failed"]),
    input: z.unknown(),
    output: z.unknown().nullable(),
    error: z.string().nullable(),
    correlationId: z.string(),
    createdAt: z.string(),
    startedAt: z.string().nullable(),
    finishedAt: z.string().nullable(),
  })
  .openapi("AutomationRun");

export const AutomationRunListSchema = z
  .object({ data: z.array(AutomationRunSchema), meta: PageMetaSchema })
  .openapi("AutomationRunList");

export const ExtensionKindSchema = z.enum(["connector", "channel", "step"]).openapi("ExtensionKind");

export const ExtensionSchema = z
  .object({
    id: z.string().uuid(),
    orgId: z.string().uuid(),
    kind: ExtensionKindSchema,
    type: z.string(),
    key: z.string(),
    config: z.unknown(),
    active: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Extension");

export const ExtensionTypeSchema = z
  .object({ kind: ExtensionKindSchema, type: z.string(), description: z.string(), requiredCapability: z.string() })
  .openapi("ExtensionType");

export const CreateExtensionSchema = z
  .object({ kind: ExtensionKindSchema, type: z.string(), key: z.string().min(1), config: z.unknown().optional() })
  .openapi("CreateExtensionInput");

export const ExtensionListSchema = z
  .object({ data: z.array(ExtensionSchema), availableTypes: z.array(ExtensionTypeSchema), meta: PageMetaSchema })
  .openapi("ExtensionList");

export const HealthSchema = z
  .object({ ok: z.boolean(), service: z.string(), version: z.string(), timestamp: z.string() })
  .openapi("Health");

export const StatsSchema = z
  .object({
    leads: z.number().int(),
    accounts: z.number().int(),
    automationRuns: z.number().int(),
    webhookSubscriptions: z.number().int(),
    webhookDeadLetterCount: z.number().int(),
    eventsLast24h: z.number().int(),
  })
  .openapi("Stats");
