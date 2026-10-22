import { z } from "zod";
import {
  ApiKeyCreateResponseSchema,
  ApiKeyCreateSchema,
  AutomationRunSchema,
  AutomationRunTriggerSchema,
  ContactCreateSchema,
  ContactSchema,
  ContactUpdateSchema,
  DealCreateSchema,
  DealSchema,
  DealUpdateSchema,
  ErrorEnvelopeSchema,
  LeadCreateSchema,
  LeadSchema,
  LeadUpdateSchema,
  PlaybookSchema,
  StatsSchema,
  WebhookDeliverySchema,
  WebhookSubscriptionCreateResponseSchema,
  WebhookSubscriptionCreateSchema,
  WebhookSubscriptionSchema,
  listResponseSchema,
} from "./schemas";

/**
 * Central, typed route registry — the single source of truth the OpenAPI
 * spec, the Postman collection, the generated SDK, and the contract tests
 * are all generated/validated from. Route handlers under src/app/api/v1
 * import the same zod schemas referenced here, so spec and implementation
 * cannot silently drift apart.
 */
export type RouteSpec = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string; // OpenAPI-style, e.g. /v1/leads/{id}
  operationId: string;
  summary: string;
  tags: string[];
  security: "apiKey" | "none";
  scopes?: string[];
  query?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
  body?: z.ZodTypeAny;
  responses: Partial<Record<200 | 201 | 204 | 304, z.ZodTypeAny>>;
  idempotent?: boolean;
  supportsEtag?: boolean;
  deprecated?: boolean;
};

const listQuery = z.object({
  cursor: z.string().optional(),
  limit: z.string().optional(),
  sort: z.string().optional(),
});

const idParam = z.object({ id: z.string().uuid() });

export const routeRegistry: RouteSpec[] = [
  {
    method: "POST",
    path: "/v1/api-keys",
    operationId: "createApiKey",
    summary: "Admin-only: mint a new API key with the given scopes",
    tags: ["Admin"],
    security: "apiKey",
    scopes: ["admin"],
    body: ApiKeyCreateSchema,
    responses: { 201: ApiKeyCreateResponseSchema },
    idempotent: true,
  },
  {
    method: "GET",
    path: "/v1/leads",
    operationId: "listLeads",
    summary: "List leads (cursor-paginated, filterable, sortable)",
    tags: ["Leads"],
    security: "apiKey",
    scopes: ["leads:read"],
    query: listQuery.extend({
      status: z.string().optional(),
      "score[gte]": z.string().optional(),
      "score[lte]": z.string().optional(),
    }),
    responses: { 200: listResponseSchema(LeadSchema) },
  },
  {
    method: "POST",
    path: "/v1/leads",
    operationId: "createLead",
    summary: "Create a lead",
    tags: ["Leads"],
    security: "apiKey",
    scopes: ["leads:write"],
    body: LeadCreateSchema,
    responses: { 201: LeadSchema },
    idempotent: true,
  },
  {
    method: "GET",
    path: "/v1/leads/{id}",
    operationId: "getLead",
    summary: "Get a lead by id",
    tags: ["Leads"],
    security: "apiKey",
    scopes: ["leads:read"],
    params: idParam,
    responses: { 200: LeadSchema },
    supportsEtag: true,
  },
  {
    method: "PATCH",
    path: "/v1/leads/{id}",
    operationId: "updateLead",
    summary: "Update a lead",
    tags: ["Leads"],
    security: "apiKey",
    scopes: ["leads:write"],
    params: idParam,
    body: LeadUpdateSchema,
    responses: { 200: LeadSchema },
  },
  {
    method: "DELETE",
    path: "/v1/leads/{id}",
    operationId: "deleteLead",
    summary: "Soft-delete a lead",
    tags: ["Leads"],
    security: "apiKey",
    scopes: ["leads:write"],
    params: idParam,
    responses: { 204: z.void() },
  },

  {
    method: "GET",
    path: "/v1/contacts",
    operationId: "listContacts",
    summary: "List contacts",
    tags: ["Contacts"],
    security: "apiKey",
    scopes: ["contacts:read"],
    query: listQuery.extend({ leadId: z.string().uuid().optional() }),
    responses: { 200: listResponseSchema(ContactSchema) },
  },
  {
    method: "POST",
    path: "/v1/contacts",
    operationId: "createContact",
    summary: "Create a contact",
    tags: ["Contacts"],
    security: "apiKey",
    scopes: ["contacts:write"],
    body: ContactCreateSchema,
    responses: { 201: ContactSchema },
    idempotent: true,
  },
  {
    method: "GET",
    path: "/v1/contacts/{id}",
    operationId: "getContact",
    summary: "Get a contact by id",
    tags: ["Contacts"],
    security: "apiKey",
    scopes: ["contacts:read"],
    params: idParam,
    responses: { 200: ContactSchema },
    supportsEtag: true,
  },
  {
    method: "PATCH",
    path: "/v1/contacts/{id}",
    operationId: "updateContact",
    summary: "Update a contact",
    tags: ["Contacts"],
    security: "apiKey",
    scopes: ["contacts:write"],
    params: idParam,
    body: ContactUpdateSchema,
    responses: { 200: ContactSchema },
  },
  {
    method: "DELETE",
    path: "/v1/contacts/{id}",
    operationId: "deleteContact",
    summary: "Delete a contact",
    tags: ["Contacts"],
    security: "apiKey",
    scopes: ["contacts:write"],
    params: idParam,
    responses: { 204: z.void() },
  },

  {
    method: "GET",
    path: "/v1/deals",
    operationId: "listDeals",
    summary: "List deals",
    tags: ["Deals"],
    security: "apiKey",
    scopes: ["deals:read"],
    query: listQuery.extend({ stage: z.string().optional(), leadId: z.string().uuid().optional() }),
    responses: { 200: listResponseSchema(DealSchema) },
  },
  {
    method: "POST",
    path: "/v1/deals",
    operationId: "createDeal",
    summary: "Create a deal",
    tags: ["Deals"],
    security: "apiKey",
    scopes: ["deals:write"],
    body: DealCreateSchema,
    responses: { 201: DealSchema },
    idempotent: true,
  },
  {
    method: "GET",
    path: "/v1/deals/{id}",
    operationId: "getDeal",
    summary: "Get a deal by id",
    tags: ["Deals"],
    security: "apiKey",
    scopes: ["deals:read"],
    params: idParam,
    responses: { 200: DealSchema },
    supportsEtag: true,
  },
  {
    method: "PATCH",
    path: "/v1/deals/{id}",
    operationId: "updateDeal",
    summary: "Update a deal",
    tags: ["Deals"],
    security: "apiKey",
    scopes: ["deals:write"],
    params: idParam,
    body: DealUpdateSchema,
    responses: { 200: DealSchema },
  },

  {
    method: "GET",
    path: "/v1/webhooks/subscriptions",
    operationId: "listWebhookSubscriptions",
    summary: "List webhook subscriptions",
    tags: ["Webhooks"],
    security: "apiKey",
    scopes: ["webhooks:read"],
    query: listQuery,
    responses: { 200: listResponseSchema(WebhookSubscriptionSchema) },
  },
  {
    method: "POST",
    path: "/v1/webhooks/subscriptions",
    operationId: "createWebhookSubscription",
    summary: "Create a webhook subscription. The signing secret is returned once.",
    tags: ["Webhooks"],
    security: "apiKey",
    scopes: ["webhooks:write"],
    body: WebhookSubscriptionCreateSchema,
    responses: { 201: WebhookSubscriptionCreateResponseSchema },
    idempotent: true,
  },
  {
    method: "DELETE",
    path: "/v1/webhooks/subscriptions/{id}",
    operationId: "deleteWebhookSubscription",
    summary: "Delete a webhook subscription",
    tags: ["Webhooks"],
    security: "apiKey",
    scopes: ["webhooks:write"],
    params: idParam,
    responses: { 204: z.void() },
  },
  {
    method: "GET",
    path: "/v1/webhooks/subscriptions/{id}/deliveries",
    operationId: "listWebhookDeliveries",
    summary: "List delivery attempts for a subscription (payloads redacted)",
    tags: ["Webhooks"],
    security: "apiKey",
    scopes: ["webhooks:read"],
    params: idParam,
    query: listQuery,
    responses: { 200: listResponseSchema(WebhookDeliverySchema) },
  },
  {
    method: "POST",
    path: "/v1/webhooks/subscriptions/{id}/test",
    operationId: "testFireWebhook",
    summary: "Fire a synthetic test event at a subscription",
    tags: ["Webhooks"],
    security: "apiKey",
    scopes: ["webhooks:write"],
    params: idParam,
    responses: { 201: WebhookDeliverySchema },
    idempotent: true,
  },
  {
    method: "POST",
    path: "/v1/webhooks/_worker/tick",
    operationId: "runWebhookWorkerTick",
    summary: "Admin-only: process due webhook deliveries/retries now (simulates the background worker)",
    tags: ["Webhooks"],
    security: "apiKey",
    scopes: ["admin"],
    responses: { 200: z.object({ processed: z.number().int() }) },
  },

  {
    method: "GET",
    path: "/v1/playbooks",
    operationId: "listPlaybooks",
    summary: "List playbooks",
    tags: ["Automation"],
    security: "apiKey",
    scopes: ["automation:read"],
    query: listQuery,
    responses: { 200: listResponseSchema(PlaybookSchema) },
  },
  {
    method: "GET",
    path: "/v1/automation-runs",
    operationId: "listAutomationRuns",
    summary: "List/poll automation runs",
    tags: ["Automation"],
    security: "apiKey",
    scopes: ["automation:read"],
    query: listQuery.extend({ status: z.string().optional() }),
    responses: { 200: listResponseSchema(AutomationRunSchema) },
  },
  {
    method: "POST",
    path: "/v1/automation-runs",
    operationId: "triggerAutomationRun",
    summary: "Trigger a playbook run",
    tags: ["Automation"],
    security: "apiKey",
    scopes: ["automation:write"],
    body: AutomationRunTriggerSchema,
    responses: { 201: AutomationRunSchema },
    idempotent: true,
  },
  {
    method: "GET",
    path: "/v1/automation-runs/{id}",
    operationId: "getAutomationRun",
    summary: "Get a single automation run (poll for completion)",
    tags: ["Automation"],
    security: "apiKey",
    scopes: ["automation:read"],
    params: idParam,
    responses: { 200: AutomationRunSchema },
    supportsEtag: true,
  },

  {
    method: "GET",
    path: "/v1/events/stream",
    operationId: "streamEvents",
    summary: "Server-Sent Events stream of domain + automation events (public realtime stream, scoped)",
    tags: ["Realtime"],
    security: "apiKey",
    scopes: ["leads:read"],
    responses: {},
  },

  {
    method: "GET",
    path: "/v1/stats",
    operationId: "getStats",
    summary: "Aggregate platform stats",
    tags: ["Status"],
    security: "apiKey",
    scopes: ["leads:read"],
    responses: { 200: StatsSchema },
  },
];

export const errorEnvelopeSchema = ErrorEnvelopeSchema;

/** Legacy (pre-v1) paths kept as deprecated shims, mapped 1:1 onto their v1 replacement. */
export const deprecatedShimMap: Record<string, string> = {
  "GET /api/leads": "GET /api/v1/leads",
  "POST /api/leads": "POST /api/v1/leads",
  "GET /api/leads/{id}": "GET /api/v1/leads/{id}",
  "PATCH /api/leads/{id}": "PATCH /api/v1/leads/{id}",
  "DELETE /api/leads/{id}": "DELETE /api/v1/leads/{id}",
  "GET /api/contacts": "GET /api/v1/contacts",
  "POST /api/contacts": "POST /api/v1/contacts",
  "GET /api/contacts/{id}": "GET /api/v1/contacts/{id}",
  "GET /api/deals": "GET /api/v1/deals",
  "POST /api/deals": "POST /api/v1/deals",
  "GET /api/deals/{id}": "GET /api/v1/deals/{id}",
};

/** Sunset policy: shims are removed no sooner than 6 months after the v1 freeze date below. */
export const V1_FREEZE_DATE = "2026-02-01";
export const SHIM_SUNSET_DATE = "2026-08-01";
