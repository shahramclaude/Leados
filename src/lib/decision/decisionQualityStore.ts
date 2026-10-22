// =============================================================================
// LEADOS — Part 23 — DQ score persistence (DB-backed; wraps the pure scorer)
// =============================================================================

import { db } from "@/db";
import { decisionQualityScores, decisions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getDecision } from "./decisionEngine";
import { scoreDecisionQuality, type RaterScoreInput } from "./decisionQuality";
import { appendEvent } from "./eventLog";

export async function recordDQScore(decisionId: string, rater: RaterScoreInput) {
  const decision = await getDecision(decisionId);
  if (!decision) throw new Error("decision not found");

  const result = scoreDecisionQuality(decision, rater);

  const [row] = await db
    .insert(decisionQualityScores)
    .values({
      decisionId,
      frame: result.scores.frame,
      options: result.scores.options,
      evidence: result.scores.evidence,
      expectations: result.scores.expectations,
      reversibility: result.scores.reversibility,
      review: result.scores.review,
      dq: result.dq,
      autoDq: result.autoDq,
      gamingRisk: result.gamingRisk,
      scoredBy: result.scoredBy,
      notes: { text: result.notes },
    })
    .returning();

  await appendEvent({
    orgId: decision.orgId,
    entityType: "decision",
    entityId: decisionId,
    type: "decision.quality_scored",
    payload: { dq: result.dq, autoDq: result.autoDq, gamingRisk: result.gamingRisk, scoredBy: result.scoredBy },
  });

  return { row, result };
}

export async function listDQScores(decisionId: string) {
  return db
    .select()
    .from(decisionQualityScores)
    .where(eq(decisionQualityScores.decisionId, decisionId))
    .orderBy(desc(decisionQualityScores.createdAt));
}

export interface DQTrendPoint {
  weekStart: string;
  avgDq: number;
  count: number;
}

/** DQ trend aggregated by ISO week across an org's decisions — team/process
 * level only, never per-individual (honesty rule: no individual shaming). */
export async function computeDQTrendForOrg(orgId: string): Promise<DQTrendPoint[]> {
  const rows = await db
    .select({ score: decisionQualityScores, decision: decisions })
    .from(decisionQualityScores)
    .innerJoin(decisions, eq(decisionQualityScores.decisionId, decisions.id))
    .where(eq(decisions.orgId, orgId));

  const byWeek = new Map<string, number[]>();
  for (const { score } of rows) {
    const d = new Date(score.createdAt);
    const weekStart = startOfIsoWeek(d).toISOString().slice(0, 10);
    const arr = byWeek.get(weekStart) ?? [];
    arr.push(score.dq);
    byWeek.set(weekStart, arr);
  }

  return [...byWeek.entries()]
    .map(([weekStart, values]) => ({
      weekStart,
      avgDq: Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)),
      count: values.length,
    }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

function startOfIsoWeek(d: Date): Date {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  if (day !== 1) date.setUTCDate(date.getUTCDate() - (day - 1));
  return date;
}
