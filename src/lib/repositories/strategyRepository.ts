// src/lib/repositories/strategyRepository.ts — typed reads over
// decisions_projection / okr_projection.
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { decisionsProjection, okrProjection } from "@/db/schema";

export type DecisionRow = typeof decisionsProjection.$inferSelect;
export type OkrRow = typeof okrProjection.$inferSelect;

export async function listDecisions(params: { status?: string; limit?: number } = {}): Promise<DecisionRow[]> {
  const limit = Math.min(params.limit ?? 100, 500);
  if (params.status) {
    return db.select().from(decisionsProjection).where(eq(decisionsProjection.status, params.status)).limit(limit);
  }
  return db.select().from(decisionsProjection).orderBy(desc(decisionsProjection.loggedAt)).limit(limit);
}

export async function getDecisionById(id: string): Promise<DecisionRow | null> {
  const [row] = await db.select().from(decisionsProjection).where(eq(decisionsProjection.id, id)).limit(1);
  return row ?? null;
}

export async function listOkrs(limit = 50): Promise<OkrRow[]> {
  return db.select().from(okrProjection).orderBy(desc(okrProjection.updatedAt)).limit(limit);
}
