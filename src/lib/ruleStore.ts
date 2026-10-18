// DB-backed access layer for rules + their evaluation history. This is the
// bridge between the static RULE_REGISTRY (definitions) and the live,
// self-calibrated weights that selfImprove.ts adjusts over time.

import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import type { db as DbClient } from "@/db";
import { decisionOutcomes, ruleEvaluations, rules } from "@/db/schema";
import { RULE_REGISTRY } from "./ruleRegistry";

type Database = typeof DbClient;

export interface RuleRow {
  id: number;
  key: string;
  name: string;
  description: string | null;
  category: string;
  weight: number;
  baseWeight: number;
  enabled: boolean;
}

/** Ensures every rule in RULE_REGISTRY has a corresponding row in `rules`. */
export async function ensureRulesSeeded(db: Database): Promise<void> {
  for (const def of RULE_REGISTRY) {
    await db
      .insert(rules)
      .values({
        key: def.key,
        name: def.name,
        description: def.description,
        category: def.category,
        weight: def.baseWeight,
        baseWeight: def.baseWeight,
      })
      .onConflictDoNothing({ target: rules.key });
  }
}

export async function getAllRules(db: Database): Promise<RuleRow[]> {
  return db.select().from(rules).orderBy(rules.key);
}

export async function getRuleByKey(db: Database, key: string): Promise<RuleRow | undefined> {
  const rows = await db.select().from(rules).where(eq(rules.key, key)).limit(1);
  return rows[0];
}

export async function updateRuleWeight(
  db: Database,
  key: string,
  newWeight: number,
): Promise<void> {
  await db
    .update(rules)
    .set({ weight: newWeight, updatedAt: new Date() })
    .where(eq(rules.key, key));
}

export async function recordRuleEvaluation(
  db: Database,
  params: {
    ruleId: number;
    runId: string;
    predictedProbability: number;
    outcome?: boolean | null;
    context?: unknown;
  },
): Promise<void> {
  await db.insert(ruleEvaluations).values({
    ruleId: params.ruleId,
    runId: params.runId,
    predictedProbability: params.predictedProbability,
    outcome: params.outcome ?? null,
    context: (params.context ?? null) as never,
  });
}

/**
 * Fetches the last `windowDays` of resolved (outcome IS NOT NULL) rule
 * evaluations AND decision outcomes for a given rule, pooled together, as
 * required by the calibration spec ("reads the last 30 days of
 * rule_evaluations + decision outcomes from DB").
 */
export async function getResolvedOutcomesForRule(
  db: Database,
  ruleId: number,
  windowDays = 30,
): Promise<Array<{ predicted: number; outcome: boolean }>> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const evalRows = await db
    .select({
      predicted: ruleEvaluations.predictedProbability,
      outcome: ruleEvaluations.outcome,
    })
    .from(ruleEvaluations)
    .where(
      and(
        eq(ruleEvaluations.ruleId, ruleId),
        isNotNull(ruleEvaluations.outcome),
        gte(ruleEvaluations.evaluatedAt, since),
      ),
    )
    .orderBy(desc(ruleEvaluations.evaluatedAt));

  const decisionRows = await db
    .select({
      predicted: decisionOutcomes.predictedProbability,
      outcome: decisionOutcomes.outcome,
    })
    .from(decisionOutcomes)
    .where(
      and(
        eq(decisionOutcomes.ruleId, ruleId),
        isNotNull(decisionOutcomes.outcome),
        gte(decisionOutcomes.createdAt, since),
      ),
    )
    .orderBy(desc(decisionOutcomes.createdAt));

  return [...evalRows, ...decisionRows]
    .filter((row): row is { predicted: number; outcome: boolean } => row.outcome !== null)
    .map((row) => ({ predicted: row.predicted, outcome: row.outcome }));
}
