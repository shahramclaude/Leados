// =============================================================================
// LEADOS — Part 11: semantic cache
// =============================================================================
// Keyed by (task, groundingHash, promptVersion). Since the GroundingSet is
// computed deterministically, identical inputs → identical hash → it is safe
// to reuse a prior, already-lint-passed generation without calling a model at
// all. This is the single biggest cost lever for repeat Ask-LEADOS queries and
// for briefings regenerated before any underlying data changed.
// =============================================================================

import { db } from "@/db";
import { llmCache } from "@/db/schema";
import { eq, lt } from "drizzle-orm";
import { computeCacheKey } from "./groundingHash";
import type { GenerationResult } from "./types";

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

export async function getCached(task: string, groundingHash: string, promptVersion: string): Promise<GenerationResult | null> {
  const key = computeCacheKey(task, groundingHash, promptVersion);
  const rows = await db.select().from(llmCache).where(eq(llmCache.cacheKey, key)).limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return row.output as unknown as GenerationResult;
}

export async function setCached(task: string, groundingHash: string, promptVersion: string, result: GenerationResult, ttlMs = DEFAULT_TTL_MS): Promise<void> {
  const key = computeCacheKey(task, groundingHash, promptVersion);
  const expiresAt = new Date(Date.now() + ttlMs);
  await db
    .insert(llmCache)
    .values({ cacheKey: key, task, groundingHash, output: result as unknown as Record<string, unknown>, expiresAt })
    .onConflictDoUpdate({
      target: llmCache.cacheKey,
      set: { output: result as unknown as Record<string, unknown>, expiresAt },
    });
}

export async function purgeExpiredCache(): Promise<number> {
  const res = await db.delete(llmCache).where(lt(llmCache.expiresAt, new Date()));
  return res.rowCount ?? 0;
}
