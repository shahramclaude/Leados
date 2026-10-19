// src/lib/ruleStore.ts
//
// DB persistence for rule weights + evaluation history. ruleEngine.ts and
// agentCore.ts are the only callers.

import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import type { db as defaultDb } from "@/db";
import { ruleEvaluations, rules } from "@/db/schema";
import { allRuleDefinitions } from "./ruleRegistry";

type Database = typeof defaultDb;

export interface StoredRule {
  id: number;
  key: string;
  name: string;
  domain: string;
  baseSeverity: number;
  weight: number;
}

/** Ensures every rule in the registry has a corresponding row (idempotent
 * upsert on first run / whenever a new rule is added to the registry). */
export async function ensureRulesSeeded(db: Database): Promise<void> {
  for (const def of allRuleDefinitions()) {
    await db
      .insert(rules)
      .values({
        key: def.key,
        name: def.name,
        domain: def.domain,
        baseSeverity: def.baseSeverity,
        weight: 1,
      })
      .onConflictDoNothing({ target: rules.key });
  }
}

export async function getAllRules(db: Database): Promise<StoredRule[]> {
  await ensureRulesSeeded(db);
  const rows = await db.select().from(rules);
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    domain: r.domain,
    baseSeverity: r.baseSeverity,
    weight: r.weight,
  }));
}

export async function getRuleByKey(db: Database, key: string): Promise<StoredRule | null> {
  const [row] = await db.select().from(rules).where(eq(rules.key, key)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    domain: row.domain,
    baseSeverity: row.baseSeverity,
    weight: row.weight,
  };
}

export async function updateRuleWeight(db: Database, key: string, newWeight: number): Promise<void> {
  await db.update(rules).set({ weight: newWeight, updatedAt: new Date() }).where(eq(rules.key, key));
}

export async function recordRuleEvaluation(
  db: Database,
  evaluation: {
    ruleKey: string;
    domain: string;
    fired: boolean;
    severity: number;
    predictedProbability: number;
    evaluatedAt: Date;
  },
): Promise<void> {
  await db.insert(ruleEvaluations).values(evaluation);
}

/** Resolves outcomes for Brier-score calibration: evaluations that have had
 * an outcome recorded (via markRuleEvaluationOutcome), within the lookback
 * window. */
export async function getResolvedOutcomesForRule(
  db: Database,
  ruleKey: string,
  lookbackDays: number,
): Promise<Array<{ predicted: number; outcome: boolean }>> {
  const cutoff = new Date(Date.now() - lookbackDays * 86_400_000);
  const rows = await db
    .select()
    .from(ruleEvaluations)
    .where(
      and(
        eq(ruleEvaluations.ruleKey, ruleKey),
        gte(ruleEvaluations.evaluatedAt, cutoff),
        eq(ruleEvaluations.outcomeRecorded, true),
        isNotNull(ruleEvaluations.outcome),
      ),
    );
  return rows.map((r) => ({ predicted: r.predictedProbability, outcome: Boolean(r.outcome) }));
}

export async function getRecentEvaluations(
  db: Database,
  ruleKey: string,
  lookbackDays: number,
) {
  const cutoff = new Date(Date.now() - lookbackDays * 86_400_000);
  return db
    .select()
    .from(ruleEvaluations)
    .where(and(eq(ruleEvaluations.ruleKey, ruleKey), gte(ruleEvaluations.evaluatedAt, cutoff)))
    .orderBy(desc(ruleEvaluations.evaluatedAt));
}

export async function markRuleEvaluationOutcome(
  db: Database,
  evaluationId: number,
  outcome: boolean,
): Promise<void> {
  await db
    .update(ruleEvaluations)
    .set({ outcomeRecorded: true, outcome, resolvedAt: new Date() })
    .where(eq(ruleEvaluations.id, evaluationId));
}
