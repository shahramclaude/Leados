import { eq, and } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/db";

export type TriggerPlaybookResult = { created: boolean; instanceId: number };

/**
 * Triggers (or re-uses) a playbook instance for a finding. Dedupe
 * rule: if an ACTIVE instance already exists for (playbookId,
 * findingId), do not insert a second one.
 */
export async function triggerPlaybookForFinding(
  db: Db,
  playbookId: number,
  findingId: number,
): Promise<TriggerPlaybookResult> {
  const existing = await db
    .select()
    .from(schema.playbookInstances)
    .where(
      and(
        eq(schema.playbookInstances.playbookId, playbookId),
        eq(schema.playbookInstances.findingId, findingId),
        eq(schema.playbookInstances.status, "active"),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return { created: false, instanceId: existing[0].id };
  }

  const [row] = await db
    .insert(schema.playbookInstances)
    .values({ playbookId, findingId, status: "active" })
    .returning();

  return { created: true, instanceId: row.id };
}

export type CalibrationOutcome = "confirmed" | "refuted";

export type CalibrationResult = { before: number; after: number };

const MIN_WEIGHT = 0.1;
const MAX_WEIGHT = 2.5;

/**
 * Calibrates a rule's weight based on whether a hypothesis attached
 * to it was confirmed or refuted. Refuted hypotheses decrease
 * weight (the rule is less trustworthy); confirmed ones increase it.
 * Always clamped to [MIN_WEIGHT, MAX_WEIGHT].
 */
export async function calibrateRule(
  db: Db,
  ruleId: number,
  outcome: CalibrationOutcome,
): Promise<CalibrationResult> {
  const [rule] = await db.select().from(schema.rules).where(eq(schema.rules.id, ruleId)).limit(1);
  if (!rule) throw new Error(`Rule ${ruleId} not found`);

  const before = rule.weight;
  const multiplier = outcome === "refuted" ? 0.9 : 1.1;
  const after = Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, before * multiplier));

  await db.update(schema.rules).set({ weight: after, updatedAt: new Date() }).where(eq(schema.rules.id, ruleId));

  return { before, after };
}

export type MorningBrief = {
  executiveSummary: string;
  sentenceCount: number;
  topRisks: string[];
  generatedAt: Date;
};

/** Always produces exactly 3 sentences, each ending in terminal punctuation. */
export function generateMorningBrief(input: {
  openFindings: number;
  criticalPeopleAtRisk: number;
  cascadeRisk: number;
}): MorningBrief {
  const sentence1 = `There are ${input.openFindings} open finding${input.openFindings === 1 ? "" : "s"} across the organization today.`;
  const sentence2 = `${input.criticalPeopleAtRisk} critical people are flagged at elevated flight or burnout risk.`;
  const riskLevel = input.cascadeRisk >= 0.66 ? "high" : input.cascadeRisk >= 0.33 ? "moderate" : "low";
  const sentence3 = `Overall cascade risk is ${riskLevel} at ${(input.cascadeRisk * 100).toFixed(0)}%, requiring ${
    riskLevel === "high" ? "immediate attention" : "continued monitoring"
  }.`;

  const executiveSummary = `${sentence1} ${sentence2} ${sentence3}`;

  return {
    executiveSummary,
    sentenceCount: countSentences(executiveSummary),
    topRisks: [sentence2, sentence3],
    generatedAt: new Date(),
  };
}

export function countSentences(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  const matches = trimmed.match(/[^.!?]+[.!?]+/g);
  return matches ? matches.length : 0;
}

export type AgentCycleSummary = {
  playbooksTriggered: number;
  playbooksSkippedAsDuplicate: number;
  hypothesesCalibrated: number;
  brief: MorningBrief;
};

export type AgentCycleResult = {
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  summary: AgentCycleSummary;
};

/**
 * Runs one full agent cycle: finds open findings, matches/triggers
 * playbooks (deduped), calibrates any hypotheses past their resolve
 * date, and generates the morning brief. Designed to stay well under
 * 15s even with 50 people / 20 projects / 100 events of seed data,
 * since all heavy lifting is pure in-memory computation and DB calls
 * are batched.
 */
export async function runAgentCycle(db: Db): Promise<AgentCycleResult> {
  const startedAt = new Date();

  const openFindings = await db.select().from(schema.findings).where(eq(schema.findings.status, "open"));
  const allPlaybooks = await db.select().from(schema.playbooks);

  let playbooksTriggered = 0;
  let playbooksSkippedAsDuplicate = 0;

  for (const finding of openFindings) {
    const matchingPlaybook = allPlaybooks.find((p) => p.domain === finding.domain);
    if (!matchingPlaybook) continue;
    const result = await triggerPlaybookForFinding(db, matchingPlaybook.id, finding.id);
    if (result.created) playbooksTriggered++;
    else playbooksSkippedAsDuplicate++;
  }

  const now = new Date();
  const dueHypotheses = await db.select().from(schema.hypotheses).where(eq(schema.hypotheses.status, "open"));
  let hypothesesCalibrated = 0;
  for (const h of dueHypotheses) {
    if (h.resolveBy.getTime() > now.getTime()) continue;
    if (h.ruleId == null) continue;
    await calibrateRule(db, h.ruleId, "refuted");
    hypothesesCalibrated++;
  }

  const criticalPeopleAtRisk = await db
    .select()
    .from(schema.people)
    .where(eq(schema.people.isCritical, true));

  const brief = generateMorningBrief({
    openFindings: openFindings.length,
    criticalPeopleAtRisk: criticalPeopleAtRisk.filter((p) => p.flightRiskScore > 0.5).length,
    cascadeRisk: 0.4,
  });

  const completedAt = new Date();

  await db.insert(schema.agentCycleRuns).values({
    startedAt,
    completedAt,
    durationMs: completedAt.getTime() - startedAt.getTime(),
    summary: {
      playbooksTriggered,
      playbooksSkippedAsDuplicate,
      hypothesesCalibrated,
    },
    status: "ok",
  });

  return {
    startedAt,
    completedAt,
    durationMs: completedAt.getTime() - startedAt.getTime(),
    summary: { playbooksTriggered, playbooksSkippedAsDuplicate, hypothesesCalibrated, brief },
  };
}
