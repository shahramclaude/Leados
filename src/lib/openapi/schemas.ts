// Zod schemas are the single source of truth for request/response shapes.
// They power: runtime validation in route handlers, the generated OpenAPI
// spec (`api-spec.yaml`), and (via openapi-typescript) the generated SDK
// types in `sdk.ts`.
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const ErrorEnvelopeSchema = z
  .object({
    error: z.object({
      code: z
        .enum([
          "BAD_REQUEST",
          "UNAUTHORIZED",
          "FORBIDDEN",
          "NOT_FOUND",
          "CONFLICT",
          "RATE_LIMITED",
          "IDEMPOTENCY_MISMATCH",
          "VALIDATION_ERROR",
          "INTERNAL_ERROR",
        ])
        .openapi({ example: "NOT_FOUND" }),
      message: z.string().openapi({ example: "Decision not found" }),
      details: z.any().nullable(),
      correlationId: z.string().openapi({ example: "req_8f1c2e..." }),
    }),
  })
  .openapi("ErrorEnvelope");

export const PageMetaSchema = z
  .object({
    nextCursor: z.string().nullable().openapi({ example: "eyJjcmVhdGVkQXQiOi4uLn0" }),
    limit: z.number().int(),
  })
  .openapi("PageMeta");

export const DecisionSchema = z
  .object({
    id: z.string().uuid(),
    orgId: z.string(),
    title: z.string(),
    status: z.enum(["open", "decided", "deferred", "abandoned"]),
    owner: z.string().nullable(),
    description: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("Decision");

export const CreateDecisionSchema = z
  .object({
    title: z.string().min(1).max(300),
    status: z.enum(["open", "decided", "deferred", "abandoned"]).optional(),
    owner: z.string().max(200).optional(),
    description: z.string().max(5000).optional(),
  })
  .openapi("CreateDecisionInput");

export const UpdateDecisionSchema = CreateDecisionSchema.partial().openapi("UpdateDecisionInput");

export const DecisionListSchema = z
  .object({ items: z.array(DecisionSchema), page: PageMetaSchema })
  .openapi("DecisionList");

export const FindingSchema = z
  .object({
    id: z.string().uuid(),
    orgId: z.string(),
    decisionId: z.string().uuid().nullable(),
    summary: z.string(),
    severity: z.enum(["info", "warning", "critical"]),
    createdAt: z.string().datetime(),
  })
  .openapi("Finding");

export const CreateFindingSchema = z
  .object({
    decisionId: z.string().uuid().optional(),
    summary: z.string().min(1).max(2000),
    severity: z.enum(["info", "warning", "critical"]).optional(),
  })
  .openapi("CreateFindingInput");

export const FindingListSchema = z
  .object({ items: z.array(FindingSchema), page: PageMetaSchema })
  .openapi("FindingList");

export const RunTypeSchema = z.enum(["sync_crm", "digest_summary", "recalculate_scores"]).openapi("RunType");

export const RunSchema = z
  .object({
    id: z.string().uuid(),
    orgId: z.string(),
    type: RunTypeSchema,
    status: z.enum(["queued", "running", "completed", "failed"]),
    input: z.record(z.string(), z.unknown()),
    output: z.record(z.string(), z.unknown()).nullable(),
    error: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
  })
  .openapi("Run");

export const TriggerRunSchema = z
  .object({
    type: RunTypeSchema,
    input: z.record(z.string(), z.unknown()).default({}),
  })
  .openapi("TriggerRunInput");

export const RunListSchema = z.object({ items: z.array(RunSchema), page: PageMetaSchema }).openapi("RunList");

export const WebhookSubscriptionSchema = z
  .object({
    id: z.string().uuid(),
    orgId: z.string(),
    url: z.string().url(),
    eventTypes: z.array(z.string()),
    active: z.boolean(),
    description: z.string().nullable(),
    createdAt: z.string().datetime(),
  })
  .openapi("WebhookSubscription");

export const CreateWebhookSubscriptionSchema = z
  .object({
    url: z.string().url(),
    eventTypes: z.array(z.string()).min(1),
    description: z.string().max(500).optional(),
  })
  .openapi("CreateWebhookSubscriptionInput");

export const CreateWebhookSubscriptionResponseSchema = WebhookSubscriptionSchema.extend({
  secret: z.string().openapi({ description: "Shown once. Used to verify the X-Leados-Signature HMAC header." }),
}).openapi("CreateWebhookSubscriptionResponse");

export const WebhookDeliverySchema = z
  .object({
    id: z.string().uuid(),
    subscriptionId: z.string().uuid(),
    eventType: z.string(),
    status: z.enum(["pending", "delivered", "retrying", "dead_letter"]),
    attempt: z.number().int(),
    maxAttempts: z.number().int(),
    responseStatus: z.number().int().nullable(),
    nextRetryAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    deliveredAt: z.string().datetime().nullable(),
  })
  .openapi("WebhookDelivery");

export const WebhookDeliveryListSchema = z
  .object({ items: z.array(WebhookDeliverySchema), page: PageMetaSchema })
  .openapi("WebhookDeliveryList");

export const ApiTokenCreateSchema = z
  .object({
    orgId: z.string().min(1).max(200),
    name: z.string().min(1).max(200),
    scopes: z.array(z.enum(["read", "write", "webhooks", "realtime", "automation"])).min(1),
    rateLimitPerMinute: z.number().int().min(1).max(6000).optional(),
  })
  .openapi("CreateApiTokenInput");

export const ApiTokenCreateResponseSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    token: z.string().openapi({ description: "Shown once — store it securely." }),
    prefix: z.string(),
    scopes: z.array(z.string()),
    rateLimitPerMinute: z.number().int(),
  })
  .openapi("CreateApiTokenResponse");

export const SlackNotifySchema = z
  .object({
    message: z.string().min(1).max(4000),
    channelOverride: z.string().optional(),
  })
  .openapi("SlackNotifyInput");

export const StatsSchema = z
  .object({
    status: z.enum(["operational", "degraded", "down"]),
    uptimeSeconds: z.number(),
    apiVersion: z.literal("v1"),
    counts: z.object({
      decisions: z.number().int(),
      findings: z.number().int(),
      runs: z.number().int(),
      webhookSubscriptions: z.number().int(),
    }),
    webhookHealth: z.object({
      delivered: z.number().int(),
      retrying: z.number().int(),
      deadLetter: z.number().int(),
    }),
    generatedAt: z.string().datetime(),
  })
  .openapi("Stats");
