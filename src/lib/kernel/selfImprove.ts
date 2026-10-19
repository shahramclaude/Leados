// =============================================================================
// LEADOS kernel — self-improvement loop (safety-gated)
// =============================================================================
// Agents may PROPOSE a rule weight/threshold change. The proposal is scored
// against a golden dataset in a sandbox (no production writes) producing a
// before/after scorecard. It can only ever reach the production `rules`
// table via approveProposal(), which requires a human decidedBy — there is
// no code path that merges a proposal without that call.

import { db } from "@/db";
import { goldenDatasetCases, rules, selfImproveProposals } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { recordAudit } from "./audit";

export interface GoldenCase {
  id: number;
  name: string;
  domain: string;
  input: { severity?: number; score?: number };
  expectedOutcome: boolean;
}

/** Pure scoring function: given a weight + threshold, decide whether a case
 * "fires" (score * weight >= threshold*5), then compare to the case's
 * expected outcome. Returns accuracy in [0,1] and a Brier-style calibration
 * error. Deterministic and side-effect free — safe to run in a sandbox. */
export function scoreWeightAgainstCases(
  cases: GoldenCase[],
  weight: number,
  threshold: number,
): { accuracy: number; brier: number; n: number } {
  if (cases.length === 0) return { accuracy: 1, brier: 0, n: 0 };
  let correct = 0;
  let brierSum = 0;
  for (const c of cases) {
    const raw = (c.input.severity ?? c.input.score ?? 0) / 5;
    const predictedProbability = Math.max(0, Math.min(1, raw * weight));
    const fires = predictedProbability >= threshold;
    if (fires === c.expectedOutcome) correct++;
    const outcomeNum = c.expectedOutcome ? 1 : 0;
    brierSum += (predictedProbability - outcomeNum) ** 2;
  }
  return { accuracy: correct / cases.length, brier: brierSum / cases.length, n: cases.length };
}

export async function loadGoldenDataset(domain?: string): Promise<GoldenCase[]> {
  const rows = domain
    ? await db.select().from(goldenDatasetCases).where(eq(goldenDatasetCases.domain, domain))
    : await db.select().from(goldenDatasetCases);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    domain: r.domain,
    input: r.input as GoldenCase["input"],
    expectedOutcome: r.expectedOutcome,
  }));
}

export async function proposeRuleWeightChange(input: {
  ruleId: number;
  newWeight: number;
  rationale: string;
  proposedBy?: string;
}) {
  const ruleRows = await db.select().from(rules).where(eq(rules.id, input.ruleId)).limit(1);
  const rule = ruleRows[0];
  if (!rule) throw new Error(`Rule #${input.ruleId} not found`);

  const [proposal] = await db
    .insert(selfImproveProposals)
    .values({
      proposedBy: input.proposedBy ?? "agent:kernel",
      kind: "rule_weight",
      targetRuleId: input.ruleId,
      beforeValue: { weight: rule.weight, threshold: rule.threshold },
      afterValue: { weight: input.newWeight, threshold: rule.threshold },
      rationale: input.rationale,
      status: "proposed",
    })
    .returning();

  await recordAudit({
    actor: input.proposedBy ?? "agent:kernel",
    action: "self_improve.proposed",
    subjectType: "self_improve_proposal",
    subjectId: String(proposal.id),
    reason: input.rationale,
    riskClass: "medium",
  });

  return proposal;
}

/** Runs the sandboxed evaluation (golden dataset + calibration harness) and
 * stores a before/after scorecard. Never touches the production `rules`
 * table. Status moves proposed -> evaluating (idempotent to re-run). */
export async function evaluateProposal(proposalId: number) {
  const rows = await db.select().from(selfImproveProposals).where(eq(selfImproveProposals.id, proposalId)).limit(1);
  const proposal = rows[0];
  if (!proposal) throw new Error(`Proposal #${proposalId} not found`);
  if (!proposal.targetRuleId) throw new Error(`Proposal #${proposalId} has no target rule`);

  const ruleRows = await db.select().from(rules).where(eq(rules.id, proposal.targetRuleId)).limit(1);
  const rule = ruleRows[0];
  if (!rule) throw new Error(`Rule #${proposal.targetRuleId} not found`);

  const cases = await loadGoldenDataset(rule.domain);
  const before = proposal.beforeValue as { weight: number; threshold: number };
  const after = proposal.afterValue as { weight: number; threshold: number };

  const beforeScore = scoreWeightAgainstCases(cases, before.weight, before.threshold);
  const afterScore = scoreWeightAgainstCases(cases, after.weight, after.threshold);

  const scorecard = {
    datasetSize: cases.length,
    before: beforeScore,
    after: afterScore,
    accuracyDelta: afterScore.accuracy - beforeScore.accuracy,
    brierDelta: afterScore.brier - beforeScore.brier, // negative = improvement
    recommendation: afterScore.accuracy >= beforeScore.accuracy && afterScore.brier <= beforeScore.brier ? "approve" : "reject",
  };

  await db
    .update(selfImproveProposals)
    .set({ status: "evaluating", scorecard })
    .where(eq(selfImproveProposals.id, proposalId));

  await recordAudit({
    actor: "agent:kernel",
    action: "self_improve.evaluated",
    subjectType: "self_improve_proposal",
    subjectId: String(proposalId),
    reason: `Scorecard: accuracy ${beforeScore.accuracy.toFixed(2)} -> ${afterScore.accuracy.toFixed(2)}, brier ${beforeScore.brier.toFixed(3)} -> ${afterScore.brier.toFixed(3)}`,
    riskClass: "medium",
    metadata: { scorecard },
  });

  return scorecard;
}

/** The ONLY function allowed to write to the production `rules` table on
 * behalf of a self-improvement proposal — and it requires a human
 * `decidedBy`. There is no silent/automatic merge path. */
export async function approveProposal(proposalId: number, decidedBy: string, reason?: string) {
  const rows = await db.select().from(selfImproveProposals).where(eq(selfImproveProposals.id, proposalId)).limit(1);
  const proposal = rows[0];
  if (!proposal) throw new Error(`Proposal #${proposalId} not found`);
  if (proposal.status !== "evaluating") {
    throw new Error(`Proposal #${proposalId} must be evaluated before it can be approved (status=${proposal.status})`);
  }
  if (!proposal.targetRuleId) throw new Error(`Proposal #${proposalId} has no target rule`);

  const after = proposal.afterValue as { weight: number; threshold: number };
  await db.update(rules).set({ weight: after.weight, updatedAt: new Date() }).where(eq(rules.id, proposal.targetRuleId));

  const [updated] = await db
    .update(selfImproveProposals)
    .set({ status: "merged", decidedBy, decidedAt: new Date() })
    .where(eq(selfImproveProposals.id, proposalId))
    .returning();

  await recordAudit({
    actor: `human:${decidedBy}`,
    action: "self_improve.merged",
    subjectType: "self_improve_proposal",
    subjectId: String(proposalId),
    reason: reason ?? "Approved after sandbox evaluation",
    riskClass: "medium",
    metadata: { before: proposal.beforeValue, after: proposal.afterValue, scorecard: proposal.scorecard },
  });

  return updated;
}

export async function rejectProposal(proposalId: number, decidedBy: string, reason?: string) {
  const [updated] = await db
    .update(selfImproveProposals)
    .set({ status: "rejected", decidedBy, decidedAt: new Date() })
    .where(eq(selfImproveProposals.id, proposalId))
    .returning();

  await recordAudit({
    actor: `human:${decidedBy}`,
    action: "self_improve.rejected",
    subjectType: "self_improve_proposal",
    subjectId: String(proposalId),
    reason: reason ?? "Rejected after sandbox evaluation",
    riskClass: "medium",
  });

  return updated;
}

export async function listProposals(limit = 50) {
  return db.select().from(selfImproveProposals).orderBy(desc(selfImproveProposals.createdAt)).limit(limit);
}
