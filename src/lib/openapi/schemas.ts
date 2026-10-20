// Single source of truth for API request/response shapes. The OpenAPI spec
// (scripts/generate-openapi.ts) AND the contract tests (tests/contract/*)
// both import these schemas, so the spec and the running code cannot drift
// silently — if a route's real response stops matching a schema here, the
// contract test fails, and if a schema changes, regenerating the spec picks
// it up automatically.
import { extendZodWithOpenApi, OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  description: "API token (see API_TOKEN env var). Required for all mutating requests.",
});

export const ErrorSchema = registry.register(
  "Error",
  z.object({ error: z.string() }).openapi({ description: "Standard error envelope." }),
);

export const HealthSchema = registry.register(
  "Health",
  z.object({
    ok: z.boolean(),
    service: z.literal("leados"),
    database: z.enum(["connected", "unreachable"]),
    error: z.string().optional(),
  }),
);

export const EventRecordSchema = registry.register(
  "EventRecord",
  z.object({
    id: z.number().int(),
    type: z.string(),
    version: z.number().int(),
    payload: z.unknown(),
    createdAt: z.string(),
  }),
);

export const FindingSchema = registry.register(
  "Finding",
  z.object({
    id: z.number().int(),
    title: z.string(),
    summary: z.string(),
    impact: z.number(),
    confidence: z.number(),
    effort: z.number(),
    score: z.number(),
    status: z.enum(["open", "resolved", "dismissed"]),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
);

export const DecisionSchema = registry.register(
  "Decision",
  z.object({
    id: z.number().int(),
    title: z.string(),
    context: z.string(),
    priorAlpha: z.number(),
    priorBeta: z.number(),
    posteriorAlpha: z.number(),
    posteriorBeta: z.number(),
    beliefMean: z.number(),
    status: z.enum(["open", "decided", "abandoned"]),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
);

export const AutomationRunSchema = registry.register(
  "AutomationRun",
  z.object({
    id: z.number().int(),
    kind: z.string(),
    seed: z.number().int(),
    trials: z.number().int(),
    input: z.unknown(),
    result: z.unknown(),
    status: z.enum(["completed", "failed"]),
    createdAt: z.string(),
  }),
);

export const BoardPackSchema = registry.register(
  "BoardPack",
  z.object({
    id: z.number().int(),
    periodLabel: z.string(),
    summary: z.object({
      generatedAt: z.string(),
      totals: z.object({
        events: z.number(),
        findings: z.number(),
        openFindings: z.number(),
        decisions: z.number(),
        decidedDecisions: z.number(),
        automationRuns: z.number(),
      }),
      topFindings: z.array(z.object({ id: z.number(), title: z.string(), score: z.number() })),
      recentDecisions: z.array(
        z.object({
          id: z.number(),
          title: z.string(),
          beliefMean: z.number(),
          status: z.string(),
        }),
      ),
    }),
    createdAt: z.string(),
  }),
);

export function pageSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
    total: z.number().int(),
  });
}
