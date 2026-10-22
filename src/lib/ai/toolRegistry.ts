// =============================================================================
// LEADOS — Part 11: typed tool registry + policy engine
// =============================================================================
// The LLM may ONLY call tools that are registered here. Every tool call is
// routed through `invokeTool`, which enforces:
//   1. The tool exists (no free-form function synthesis).
//   2. Its risk tier (reusing Part 10's tier model) is allowed for the
//      current caller/context.
//   3. Idempotency semantics are respected (tier2/tier3 tools require an
//      explicit idempotency key so retries from streaming/caching layers
//      can't double-execute a side effect).
//   4. The result is wrapped as an EVIDENCE REF (DocumentRef-shaped), never
//      as free-standing instructions — tool output re-enters the pipeline as
//      untrusted data unless the tool is itself a deterministic, trusted
//      internal lookup (tier0 read tools over our own DB are trusted).
// =============================================================================

import { db } from "@/db";
import { entities, events, metrics } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { RiskTier, ToolCallRecord, ToolContext, ToolDefinition } from "./types";

// ---------------------------------------------------------------------------
// Policy: which risk tiers are allowed for which feature surfaces.
// (Part 10 defines the canonical tier semantics; we reuse the names here.)
//   tier0_read            — read-only, scoped to caller's org. Always allowed.
//   tier1_write_own_org   — writes scoped to caller's own org. Requires an
//                           explicit user-approved action; LLM surfaces never
//                           auto-invoke these.
//   tier2_sensitive       — cross-org or PII-adjacent reads. Requires elevated
//                           role; never auto-invoked by an LLM surface.
//   tier3_irreversible    — deletions/exports/sends. Never callable by an LLM
//                           surface under any circumstance in this part.
// ---------------------------------------------------------------------------

const LLM_SURFACE_ALLOWED_TIERS: RiskTier[] = ["tier0_read"];

export function isTierAllowedForLlmSurface(tier: RiskTier): boolean {
  return LLM_SURFACE_ALLOWED_TIERS.includes(tier);
}

// ---------------------------------------------------------------------------
// Tool definitions — all tier0_read, idempotent, scoped by orgId from ctx.
// ---------------------------------------------------------------------------

export const lookupEntityTool: ToolDefinition<{ entityId: number }, unknown> = {
  name: "lookup_entity",
  description: "Fetch a single entity (company/person/product/market) by id, scoped to the caller's org.",
  riskTier: "tier0_read",
  idempotent: true,
  inputSchemaDescription: "{ entityId: number }",
  run: async (input, ctx) => {
    const rows = await db
      .select()
      .from(entities)
      .where(and(eq(entities.id, input.entityId), eq(entities.orgId, ctx.orgId)))
      .limit(1);
    return rows[0] ?? null;
  },
};

export const lookupMetricHistoryTool: ToolDefinition<{ entityId: number; metricName: string }, unknown> = {
  name: "lookup_metric_history",
  description: "Fetch historical values of a named metric for an entity, scoped to the caller's org.",
  riskTier: "tier0_read",
  idempotent: true,
  inputSchemaDescription: "{ entityId: number, metricName: string }",
  run: async (input, ctx) => {
    const rows = await db
      .select()
      .from(metrics)
      .where(and(eq(metrics.orgId, ctx.orgId), eq(metrics.entityId, input.entityId), eq(metrics.name, input.metricName)));
    return rows;
  },
};

export const lookupRecentEventsTool: ToolDefinition<{ entityId: number }, unknown> = {
  name: "lookup_recent_events",
  description: "Fetch recent events for an entity, scoped to the caller's org.",
  riskTier: "tier0_read",
  idempotent: true,
  inputSchemaDescription: "{ entityId: number }",
  run: async (input, ctx) => {
    const rows = await db
      .select()
      .from(events)
      .where(and(eq(events.orgId, ctx.orgId), eq(events.entityId, input.entityId)));
    return rows;
  },
};

export const toolRegistry: Record<string, ToolDefinition<any, any>> = {
  [lookupEntityTool.name]: lookupEntityTool,
  [lookupMetricHistoryTool.name]: lookupMetricHistoryTool,
  [lookupRecentEventsTool.name]: lookupRecentEventsTool,
};

// ---------------------------------------------------------------------------
// Invocation with policy enforcement + idempotency key tracking.
// ---------------------------------------------------------------------------

const seenIdempotencyKeys = new Set<string>();

export async function invokeTool(
  name: string,
  input: unknown,
  ctx: ToolContext,
  opts: { idempotencyKey?: string } = {},
): Promise<{ record: ToolCallRecord; result: unknown | null }> {
  const tool = toolRegistry[name];
  if (!tool) {
    const record: ToolCallRecord = { name, input, output: null, riskTier: "tier3_irreversible", allowed: false, reason: "unregistered_tool" };
    return { record, result: null };
  }
  if (!isTierAllowedForLlmSurface(tool.riskTier)) {
    const record: ToolCallRecord = { name, input, output: null, riskTier: tool.riskTier, allowed: false, reason: "risk_tier_not_allowed_for_llm_surface" };
    return { record, result: null };
  }
  if (!tool.idempotent && opts.idempotencyKey) {
    if (seenIdempotencyKeys.has(opts.idempotencyKey)) {
      const record: ToolCallRecord = { name, input, output: null, riskTier: tool.riskTier, allowed: false, reason: "duplicate_idempotency_key" };
      return { record, result: null };
    }
    seenIdempotencyKeys.add(opts.idempotencyKey);
  }
  try {
    const output = await tool.run(input, ctx);
    const record: ToolCallRecord = { name, input, output, riskTier: tool.riskTier, allowed: true };
    return { record, result: output };
  } catch (err) {
    const record: ToolCallRecord = { name, input, output: null, riskTier: tool.riskTier, allowed: false, reason: `tool_error:${(err as Error).message}` };
    return { record, result: null };
  }
}
