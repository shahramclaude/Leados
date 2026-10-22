/**
 * Generates api-spec.json + api-spec.yaml (OpenAPI 3.1) from the typed route
 * registry in src/lib/api/spec.ts — the single source of truth. Route
 * handlers import the exact same zod schemas, so spec and implementation
 * cannot silently drift (contract tests additionally prove this at runtime).
 *
 * Run with: npx tsx scripts/generate-api-spec.ts
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import YAML from "yaml";
import { errorEnvelopeSchema, routeRegistry, deprecatedShimMap, SHIM_SUNSET_DATE, V1_FREEZE_DATE } from "../src/lib/api/spec";
import type { ResponseConfig } from "@asteasolutions/zod-to-openapi";

// extendZodWithOpenApi(z) already ran as a side effect of importing src/lib/api/schemas
// (via src/lib/api/spec) — see the comment there for why this ordering matters.

const registry = new OpenAPIRegistry();

registry.registerComponent("securitySchemes", "ApiKeyAuth", {
  type: "http",
  scheme: "bearer",
  description: "API key issued via POST /v1/api-keys (admin-only). Send as `Authorization: Bearer <key>`.",
});

const ErrorEnvelope = registry.register("ErrorEnvelope", errorEnvelopeSchema.openapi("ErrorEnvelope"));

const commonErrorResponses = {
  400: { description: "Validation or filter/sort error", content: { "application/json": { schema: ErrorEnvelope } } },
  401: { description: "Missing/invalid API key", content: { "application/json": { schema: ErrorEnvelope } } },
  403: { description: "Insufficient scope", content: { "application/json": { schema: ErrorEnvelope } } },
  404: { description: "Not found", content: { "application/json": { schema: ErrorEnvelope } } },
  422: { description: "Idempotency-Key conflict", content: { "application/json": { schema: ErrorEnvelope } } },
  429: { description: "Rate limited", content: { "application/json": { schema: ErrorEnvelope } } },
};

for (const route of routeRegistry) {
  const responses: Record<string, ResponseConfig> = { ...commonErrorResponses };
  for (const [status, schema] of Object.entries(route.responses)) {
    if (!schema) continue;
    const isVoid = schema instanceof z.ZodVoid;
    responses[status] = {
      description: route.summary,
      ...(isVoid ? {} : { content: { "application/json": { schema } } }),
    };
  }

  registry.registerPath({
    method: route.method.toLowerCase() as "get" | "post" | "patch" | "delete",
    path: route.path,
    operationId: route.operationId,
    summary: route.summary,
    tags: route.tags,
    deprecated: route.deprecated,
    security: route.security === "apiKey" ? [{ ApiKeyAuth: route.scopes ?? [] }] : [],
    request: {
      ...(route.query ? { query: route.query as never } : {}),
      ...(route.params ? { params: route.params as never } : {}),
      ...(route.body ? { body: { content: { "application/json": { schema: route.body } } } } : {}),
    },
    responses,
  });
}

const generator = new OpenApiGeneratorV31(registry.definitions);
const document = generator.generateDocument({
  openapi: "3.1.0",
  info: {
    title: "LEADOS API",
    version: "1.0.0",
    description: [
      "LEADOS public API. See docs/API.md for the full guide (auth, pagination,",
      "errors, webhooks, realtime, deprecation policy).",
      "",
      `v1 freeze date: ${V1_FREEZE_DATE}. Pre-v1 shim sunset date: ${SHIM_SUNSET_DATE}.`,
      "",
      "Deprecated legacy path -> v1 path mapping:",
      ...Object.entries(deprecatedShimMap).map(([from, to]) => `  ${from} -> ${to}`),
    ].join("\n"),
  },
  servers: [{ url: "/api", description: "Same-origin deployment" }],
});

const outDir = path.resolve(__dirname, "..");
fs.writeFileSync(path.join(outDir, "api-spec.json"), JSON.stringify(document, null, 2) + "\n");
fs.writeFileSync(path.join(outDir, "api-spec.yaml"), YAML.stringify(document));

console.log(`[api:gen] wrote api-spec.json and api-spec.yaml with ${routeRegistry.length} routes.`);
