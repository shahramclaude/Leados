// Builds the OpenAPI 3.1 registry from the zod schemas + route metadata.
// `scripts/generate-openapi.ts` turns this into `api-spec.yaml`; contract
// tests (`scripts/contract-test.ts`) assert every route under
// `src/app/api/v1` is represented here.
import { OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
  ApiTokenCreateResponseSchema,
  ApiTokenCreateSchema,
  CreateDecisionSchema,
  CreateFindingSchema,
  CreateWebhookSubscriptionResponseSchema,
  CreateWebhookSubscriptionSchema,
  DecisionListSchema,
  DecisionSchema,
  ErrorEnvelopeSchema,
  FindingListSchema,
  FindingSchema,
  RunListSchema,
  RunSchema,
  SlackNotifySchema,
  StatsSchema,
  TriggerRunSchema,
  UpdateDecisionSchema,
  WebhookDeliveryListSchema,
  WebhookSubscriptionSchema,
} from "./schemas";

export const registry = new OpenAPIRegistry();

export const bearerAuth = registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  description: "API token issued via POST /api/v1/tokens. Example: `Authorization: Bearer lead_sk_...`",
});

const idParam = z.object({ id: z.string().uuid() });
const cursorQuery = z.object({
  cursor: z.string().optional().openapi({ description: "Opaque cursor from a previous page's `page.nextCursor`" }),
  limit: z.string().optional().openapi({ description: "Page size, 1-100 (default 25)" }),
  sort: z.string().optional().openapi({ description: "Field to sort by, prefix with `-` for descending" }),
});

const errorResponses = {
  400: { description: "Bad request", content: { "application/json": { schema: ErrorEnvelopeSchema } } },
  401: { description: "Unauthorized", content: { "application/json": { schema: ErrorEnvelopeSchema } } },
  403: { description: "Forbidden", content: { "application/json": { schema: ErrorEnvelopeSchema } } },
  404: { description: "Not found", content: { "application/json": { schema: ErrorEnvelopeSchema } } },
  409: { description: "Conflict", content: { "application/json": { schema: ErrorEnvelopeSchema } } },
  422: { description: "Validation error", content: { "application/json": { schema: ErrorEnvelopeSchema } } },
  429: { description: "Rate limited", content: { "application/json": { schema: ErrorEnvelopeSchema } } },
};

const idempotencyHeader = z.object({
  "Idempotency-Key": z.string().optional().openapi({ description: "Dedupe key for safe retries of this write" }),
});

// --- Decisions --------------------------------------------------------
registry.registerPath({
  method: "get",
  path: "/api/v1/decisions",
  tags: ["Decisions"],
  summary: "List decisions (cursor-paginated)",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: cursorQuery },
  responses: {
    200: { description: "Page of decisions", content: { "application/json": { schema: DecisionListSchema } } },
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/decisions",
  tags: ["Decisions"],
  summary: "Create a decision",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    headers: idempotencyHeader,
    body: { content: { "application/json": { schema: CreateDecisionSchema } } },
  },
  responses: {
    201: { description: "Decision created", content: { "application/json": { schema: DecisionSchema } } },
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/decisions/{id}",
  tags: ["Decisions"],
  summary: "Get a decision (supports ETag / If-None-Match)",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: {
    200: { description: "Decision", content: { "application/json": { schema: DecisionSchema } } },
    304: { description: "Not modified" },
    ...errorResponses,
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/v1/decisions/{id}",
  tags: ["Decisions"],
  summary: "Update a decision",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: idParam,
    headers: idempotencyHeader,
    body: { content: { "application/json": { schema: UpdateDecisionSchema } } },
  },
  responses: {
    200: { description: "Updated decision", content: { "application/json": { schema: DecisionSchema } } },
    ...errorResponses,
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/decisions/{id}",
  tags: ["Decisions"],
  summary: "Delete a decision",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: { 204: { description: "Deleted" }, ...errorResponses },
});

// --- Findings -----------------------------------------------------------
registry.registerPath({
  method: "get",
  path: "/api/v1/findings",
  tags: ["Findings"],
  summary: "List findings (cursor-paginated)",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: cursorQuery },
  responses: {
    200: { description: "Page of findings", content: { "application/json": { schema: FindingListSchema } } },
    ...errorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/findings",
  tags: ["Findings"],
  summary: "Create a finding",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    headers: idempotencyHeader,
    body: { content: { "application/json": { schema: CreateFindingSchema } } },
  },
  responses: {
    201: { description: "Finding created", content: { "application/json": { schema: FindingSchema } } },
    ...errorResponses,
  },
});

// --- Automation API (runs) ----------------------------------------------
registry.registerPath({
  method: "post",
  path: "/api/v1/runs",
  tags: ["Automation"],
  summary: "Trigger an automation run (idempotent on Idempotency-Key)",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    headers: idempotencyHeader,
    body: { content: { "application/json": { schema: TriggerRunSchema } } },
  },
  responses: {
    201: { description: "Run queued (or returned if replayed)", content: { "application/json": { schema: RunSchema } } },
    ...errorResponses,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/runs",
  tags: ["Automation"],
  summary: "List runs",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: cursorQuery },
  responses: { 200: { description: "Page of runs", content: { "application/json": { schema: RunListSchema } } }, ...errorResponses },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/runs/{id}",
  tags: ["Automation"],
  summary: "Poll a run's status",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: { 200: { description: "Run", content: { "application/json": { schema: RunSchema } } }, ...errorResponses },
});

// --- Realtime API ---------------------------------------------------------
registry.registerPath({
  method: "get",
  path: "/api/v1/events/stream",
  tags: ["Realtime"],
  summary: "Server-Sent Events stream of platform events, resumable via Last-Event-ID",
  description:
    "Requires the `realtime` scope. Send `Last-Event-ID` (header or `?after=` query param using the numeric sequence) to resume after a disconnect without missing events.",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: z.object({ after: z.string().optional() }) },
  responses: {
    200: { description: "text/event-stream of {id,type,orgId,createdAt,data} events", content: { "text/event-stream": { schema: z.string() } } },
    ...errorResponses,
  },
});

// --- Webhooks ---------------------------------------------------------
registry.registerPath({
  method: "get",
  path: "/api/v1/webhooks/subscriptions",
  tags: ["Webhooks"],
  summary: "List webhook subscriptions",
  security: [{ [bearerAuth.name]: [] }],
  responses: { 200: { description: "Subscriptions", content: { "application/json": { schema: z.object({ items: z.array(WebhookSubscriptionSchema) }) } } }, ...errorResponses },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/webhooks/subscriptions",
  tags: ["Webhooks"],
  summary: "Create a webhook subscription",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { "application/json": { schema: CreateWebhookSubscriptionSchema } } } },
  responses: {
    201: { description: "Subscription created; secret shown once", content: { "application/json": { schema: CreateWebhookSubscriptionResponseSchema } } },
    ...errorResponses,
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/webhooks/subscriptions/{id}",
  tags: ["Webhooks"],
  summary: "Deactivate a webhook subscription",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: { 204: { description: "Deactivated" }, ...errorResponses },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/webhooks/deliveries",
  tags: ["Webhooks"],
  summary: "List webhook delivery attempts (delivery log)",
  security: [{ [bearerAuth.name]: [] }],
  request: { query: cursorQuery },
  responses: { 200: { description: "Deliveries", content: { "application/json": { schema: WebhookDeliveryListSchema } } }, ...errorResponses },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/webhooks/deliveries/{id}/retry",
  tags: ["Webhooks"],
  summary: "Force an immediate retry of a delivery",
  security: [{ [bearerAuth.name]: [] }],
  request: { params: idParam },
  responses: { 202: { description: "Retry attempted" }, ...errorResponses },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/webhooks/sandbox",
  tags: ["Webhooks"],
  summary: "Sandbox endpoint for testing webhook delivery + HMAC signatures (no auth required)",
  responses: { 200: { description: "Echoes signature verification result" } },
});

// --- Integrations ---------------------------------------------------------
registry.registerPath({
  method: "post",
  path: "/api/v1/integrations/slack/notify",
  tags: ["Integrations"],
  summary: "Send a Slack notification via the actuation layer (reference integration)",
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { "application/json": { schema: SlackNotifySchema } } } },
  responses: { 202: { description: "Notification accepted" }, ...errorResponses },
});

// --- Tokens -----------------------------------------------------------
registry.registerPath({
  method: "post",
  path: "/api/v1/tokens",
  tags: ["Auth"],
  summary: "Create an API token (dev/bootstrap helper — protect this route in production)",
  request: { body: { content: { "application/json": { schema: ApiTokenCreateSchema } } } },
  responses: { 201: { description: "Token created", content: { "application/json": { schema: ApiTokenCreateResponseSchema } } }, ...errorResponses },
});

// --- Platform status --------------------------------------------------
registry.registerPath({
  method: "get",
  path: "/api/health",
  tags: ["Platform"],
  summary: "Liveness/readiness probe",
  responses: { 200: { description: "ok" } },
});

registry.registerPath({
  method: "get",
  path: "/api/stats",
  tags: ["Platform"],
  summary: "Public aggregate stats that power the status page",
  responses: { 200: { description: "Stats", content: { "application/json": { schema: StatsSchema } } } },
});

export function buildOpenApiDocument() {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "LEADOS Platform API",
      version: "1.0.0",
      description:
        "LEADOS public API v1. See docs/API.md for the full guide (auth, pagination, idempotency, webhooks, realtime, automation, deprecation policy).",
    },
    servers: [{ url: "/", description: "Current deployment" }],
    tags: [
      { name: "Decisions" },
      { name: "Findings" },
      { name: "Automation" },
      { name: "Realtime" },
      { name: "Webhooks" },
      { name: "Integrations" },
      { name: "Auth" },
      { name: "Platform" },
    ],
  });
}
