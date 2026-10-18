// Shared types + DB helpers for hypotheses. autonomousAgent.ts uses these to
// generate and resolve hypotheses automatically; the /api/hypothesis routes
// use the same helpers for manual creation/resolution so both paths stay
// consistent.

import { and, eq } from "drizzle-orm";
import type { db as DbClient } from "@/db";
import { hypotheses } from "@/db/schema";

type Database = typeof DbClient;

export type HypothesisStatus = "open" | "confirmed" | "refuted";
export type HypothesisEntityType = "person" | "domain" | "causal_chain";

export interface HypothesisRow {
  id: number;
  key: string;
  entityId: string;
  entityType: string;
  claim: string;
  ruleKey: string | null;
  context: unknown;
  predictedBy: Date;
  resolveBy: Date;
  status: string;
  outcomeValue: unknown;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface NewHypothesisInput {
  key: string;
  entityId: string;
  entityType: HypothesisEntityType;
  claim: string;
  ruleKey?: string | null;
  context?: unknown;
  predictedBy?: Date;
  resolveBy: Date;
}

export async function findOpenHypothesis(
  db: Database,
  key: string,
  entityId: string,
): Promise<HypothesisRow | undefined> {
  const rows = await db
    .select()
    .from(hypotheses)
    .where(and(eq(hypotheses.key, key), eq(hypotheses.entityId, entityId), eq(hypotheses.status, "open")))
    .limit(1);
  return rows[0];
}

export async function createHypothesis(db: Database, input: NewHypothesisInput): Promise<HypothesisRow | null> {
  const existing = await findOpenHypothesis(db, input.key, input.entityId);
  if (existing) return null; // dedupe by key+entity

  const [row] = await db
    .insert(hypotheses)
    .values({
      key: input.key,
      entityId: input.entityId,
      entityType: input.entityType,
      claim: input.claim,
      ruleKey: input.ruleKey ?? null,
      context: (input.context ?? null) as never,
      predictedBy: input.predictedBy ?? new Date(),
      resolveBy: input.resolveBy,
      status: "open",
    })
    .returning();

  return row;
}

export async function listOpenHypotheses(db: Database): Promise<HypothesisRow[]> {
  return db.select().from(hypotheses).where(eq(hypotheses.status, "open"));
}

export async function listAllHypotheses(db: Database): Promise<HypothesisRow[]> {
  return db.select().from(hypotheses).orderBy(hypotheses.createdAt);
}

export async function getHypothesisById(db: Database, id: number): Promise<HypothesisRow | undefined> {
  const rows = await db.select().from(hypotheses).where(eq(hypotheses.id, id)).limit(1);
  return rows[0];
}

export async function resolveHypothesisRow(
  db: Database,
  id: number,
  status: Exclude<HypothesisStatus, "open">,
  outcomeValue: unknown,
): Promise<HypothesisRow | undefined> {
  const [row] = await db
    .update(hypotheses)
    .set({ status, outcomeValue: outcomeValue as never, resolvedAt: new Date() })
    .where(eq(hypotheses.id, id))
    .returning();
  return row;
}
