// src/lib/hypothesis.ts
//
// Generic hypothesis lifecycle helpers: creation (with dedup), lookup of
// past-due open hypotheses, and resolution. agentCore.ts is the primary
// caller (Part 2, STEPS 6 + 7).

import { and, eq, lte } from "drizzle-orm";
import type { db as defaultDb } from "@/db";
import { hypotheses } from "@/db/schema";
import type { Hypothesis, HypothesisStatus } from "./types";
import { randomUUID } from "crypto";

type Database = typeof defaultDb;

export interface HypothesisCandidate {
  key: string;
  entityId: string;
  entityType: string;
  claim: string;
  predictedBy: Date;
  resolveBy: Date;
  metricToCheck?: string | null;
  threshold?: number | null;
  ruleKey?: string | null;
}

function rowToHypothesis(row: typeof hypotheses.$inferSelect): Hypothesis {
  return {
    id: row.id,
    key: row.key,
    entityId: row.entityId,
    entityType: row.entityType,
    claim: row.claim,
    predictedBy: new Date(row.predictedBy).toISOString(),
    resolveBy: new Date(row.resolveBy).toISOString(),
    status: row.status as HypothesisStatus,
    outcomeNote: row.outcomeNote,
    outcomeValue: row.outcomeValue,
    metricToCheck: row.metricToCheck,
    threshold: row.threshold,
    ruleKey: row.ruleKey,
  };
}

/**
 * Inserts a new OPEN hypothesis unless one with the same (key, entityId,
 * status='open') already exists — enforced by the DB unique index
 * `hypotheses_key_entity_status_idx` via ON CONFLICT DO NOTHING.
 * Returns the created Hypothesis, or null if it was a duplicate.
 */
export async function createHypothesisIfAbsent(
  db: Database,
  candidate: HypothesisCandidate,
): Promise<Hypothesis | null> {
  const id = randomUUID();
  const inserted = await db
    .insert(hypotheses)
    .values({
      id,
      key: candidate.key,
      entityId: candidate.entityId,
      entityType: candidate.entityType,
      claim: candidate.claim,
      predictedBy: candidate.predictedBy,
      resolveBy: candidate.resolveBy,
      status: "open",
      metricToCheck: candidate.metricToCheck ?? null,
      threshold: candidate.threshold ?? null,
      ruleKey: candidate.ruleKey ?? null,
    })
    .onConflictDoNothing({ target: [hypotheses.key, hypotheses.entityId, hypotheses.status] })
    .returning();

  if (inserted.length === 0) return null;
  return rowToHypothesis(inserted[0]);
}

export async function getOpenHypothesesPastDue(db: Database, now: Date): Promise<Hypothesis[]> {
  const horizon = new Date(now.getTime() + 24 * 3_600_000);
  const rows = await db
    .select()
    .from(hypotheses)
    .where(and(eq(hypotheses.status, "open"), lte(hypotheses.resolveBy, horizon)));
  return rows.map(rowToHypothesis);
}

export async function countOpenHypotheses(db: Database): Promise<number> {
  const rows = await db.select().from(hypotheses).where(eq(hypotheses.status, "open"));
  return rows.length;
}

export async function resolveHypothesis(
  db: Database,
  id: string,
  status: Extract<HypothesisStatus, "confirmed" | "refuted">,
  outcomeNote: string,
  outcomeValue: number,
  resolvedAt: Date,
): Promise<void> {
  await db
    .update(hypotheses)
    .set({ status, outcomeNote, outcomeValue, resolvedAt })
    .where(eq(hypotheses.id, id));
}
