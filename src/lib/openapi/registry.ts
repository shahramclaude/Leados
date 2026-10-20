import { z } from "zod";
import {
  registry,
  ErrorSchema,
  HealthSchema,
  EventRecordSchema,
  FindingSchema,
  DecisionSchema,
  AutomationRunSchema,
  BoardPackSchema,
  pageSchema,
} from "./schemas";

const bearerAuth = [{ bearerAuth: [] }];
const json = (schema: z.ZodTypeAny, description: string) => ({
  description,
  content: { "application/json": { schema } },
});

registry.registerPath({
  method: "get",
  path: "/api/health",
  summary: "Service + database health check",
  responses: { 200: json(HealthSchema, "Health status") },
});

registry.registerPath({
  method: "get",
  path: "/api/events",
  summary: "List recent events (paginated)",
  request: { query: z.object({ limit: z.string().optional(), cursor: z.string().optional() }) },
  responses: { 200: json(pageSchema(EventRecordSchema), "A page of events") },
});

registry.registerPath({
  method: "post",
  path: "/api/events",
  summary: "Record a new event",
  security: bearerAuth,
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({ type: z.string(), version: z.number(), payload: z.unknown() }),
        },
      },
    },
  },
  responses: {
    201: json(EventRecordSchema, "Event recorded"),
    400: json(ErrorSchema, "Validation failed"),
    401: json(ErrorSchema, "Missing/malformed auth header"),
    403: json(ErrorSchema, "Invalid token"),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/findings",
  summary: "List findings (paginated)",
  responses: { 200: json(pageSchema(FindingSchema), "A page of findings") },
});

registry.registerPath({
  method: "post",
  path: "/api/findings",
  summary: "Create a finding (ICE score computed server-side)",
  security: bearerAuth,
  responses: {
    201: json(FindingSchema, "Finding created"),
    400: json(ErrorSchema, "Validation failed"),
    401: json(ErrorSchema, "Missing/malformed auth header"),
    403: json(ErrorSchema, "Invalid token"),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/findings/{id}",
  summary: "Get a finding by id",
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: json(FindingSchema, "Finding"), 404: json(ErrorSchema, "Not found") },
});

registry.registerPath({
  method: "get",
  path: "/api/decisions",
  summary: "List decisions (paginated)",
  responses: { 200: json(pageSchema(DecisionSchema), "A page of decisions") },
});

registry.registerPath({
  method: "post",
  path: "/api/decisions",
  summary: "Create a decision with a Beta(1,1) prior belief",
  security: bearerAuth,
  responses: {
    201: json(DecisionSchema, "Decision created"),
    400: json(ErrorSchema, "Validation failed"),
    401: json(ErrorSchema, "Missing/malformed auth header"),
    403: json(ErrorSchema, "Invalid token"),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/decisions/{id}",
  summary: "Get a decision by id",
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: json(DecisionSchema, "Decision"), 404: json(ErrorSchema, "Not found") },
});

registry.registerPath({
  method: "patch",
  path: "/api/decisions/{id}",
  summary: "Update a decision's belief with new evidence (Bayesian update)",
  security: bearerAuth,
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: json(DecisionSchema, "Decision updated"),
    400: json(ErrorSchema, "Validation failed"),
    401: json(ErrorSchema, "Missing/malformed auth header"),
    403: json(ErrorSchema, "Invalid token"),
    404: json(ErrorSchema, "Not found"),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/automation/runs",
  summary: "List automation runs (paginated)",
  responses: { 200: json(pageSchema(AutomationRunSchema), "A page of runs") },
});

registry.registerPath({
  method: "post",
  path: "/api/automation/run",
  summary: "Trigger a Monte Carlo forecast automation run",
  security: bearerAuth,
  responses: {
    201: json(AutomationRunSchema, "Run completed"),
    400: json(ErrorSchema, "Validation failed"),
    401: json(ErrorSchema, "Missing/malformed auth header"),
    403: json(ErrorSchema, "Invalid token"),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/boardpack",
  summary: "Get the latest board pack (generates one if none exists)",
  responses: { 200: json(BoardPackSchema, "Board pack") },
});

registry.registerPath({
  method: "post",
  path: "/api/boardpack",
  summary: "Force-generate a new board pack",
  security: bearerAuth,
  responses: {
    201: json(BoardPackSchema, "Board pack generated"),
    401: json(ErrorSchema, "Missing/malformed auth header"),
    403: json(ErrorSchema, "Invalid token"),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/onboarding",
  summary: "Get onboarding status",
  responses: {
    200: json(z.object({ completed: z.boolean(), orgName: z.string().nullable() }), "Status"),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/onboarding",
  summary: "Complete onboarding",
  security: bearerAuth,
  responses: {
    201: json(z.object({ orgName: z.string() }), "Onboarding completed"),
    400: json(ErrorSchema, "Validation failed"),
    401: json(ErrorSchema, "Missing/malformed auth header"),
    403: json(ErrorSchema, "Invalid token"),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/self-test",
  summary: "Run the smoke subset of the real test suites in-process",
  responses: {
    200: json(
      z.object({
        ok: z.boolean(),
        checks: z.array(z.object({ name: z.string(), pass: z.boolean(), detail: z.string() })),
      }),
      "Self-test results",
    ),
  },
});

export { registry };
