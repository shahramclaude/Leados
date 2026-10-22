// =============================================================================
// LEADOS — Part 23 — Decision Desk ranking + evidence-gap warnings
// =============================================================================

import type { DecisionRecordView } from "./types";

const REVERSIBILITY_WEIGHT: Record<string, number> = {
  type1: 2, // irreversible — weighted up, deserves urgency
  type2: 1,
};

export function computeUrgency(record: DecisionRecordView, now: Date = new Date()): number {
  const raisedAt = new Date(record.raisedAt).getTime();
  const ageDays = Math.max(0, (now.getTime() - raisedAt) / (1000 * 60 * 60 * 24));

  // Ambient urgency grows with age, capped, plus a boost if any trigger is
  // likely close to firing is left to the debt/trigger module (reality-based);
  // here we only account for calendar aging to keep this a pure function of
  // the record itself.
  const ageScore = Math.min(5, 1 + ageDays / 3);
  return Number(ageScore.toFixed(2));
}

export interface DeskRankedDecision {
  decision: DecisionRecordView;
  urgency: number;
  reversibilityWeight: number;
  impact: number;
  rank: number;
  warnings: string[];
}

export function evidenceGapWarnings(record: DecisionRecordView): string[] {
  const warnings: string[] = [];
  const options = record.optionsConsidered ?? [];

  if (options.length < 2 && record.status !== "raised") {
    warnings.push("Only one option on record — a false choice.");
  }

  const evidence = record.optionEvidence ?? {};
  const noInterval = options.filter((o) => !evidence[o]?.interval);
  if (options.length > 0 && noInterval.length === options.length) {
    warnings.push("No option has an interval yet.");
  } else if (noInterval.length > 0) {
    warnings.push(`${noInterval.length} of ${options.length} option(s) missing an interval.`);
  }

  if (record.status === "decided" || record.status === "reviewed") {
    if (!record.expected?.reviewAt) {
      warnings.push("No review date set for a committed decision.");
    }
    if ((record.triggerConditions ?? []).length === 0) {
      warnings.push("No trigger conditions — review depends on someone remembering the calendar date.");
    }
    if ((record.dissent ?? []).length > 0 && record.dissent.some((d) => !d.response)) {
      warnings.push("Dissent recorded without a response.");
    }
  }

  if (record.decisionType === "type1" && !record.reversibilityPlan && record.status !== "raised") {
    warnings.push("Irreversible (type1) decision has no reversibility plan.");
  }

  return warnings;
}

export function rankDecisionDesk(
  records: DecisionRecordView[],
  now: Date = new Date(),
): DeskRankedDecision[] {
  const open = records.filter((r) => r.status !== "reviewed");

  const scored = open.map((decision) => {
    const urgency = computeUrgency(decision, now);
    const reversibilityWeight = REVERSIBILITY_WEIGHT[decision.decisionType] ?? 1;
    const impact = decision.impact;
    const rank = Number((urgency * reversibilityWeight * impact).toFixed(2));
    const warnings = evidenceGapWarnings(decision);
    return { decision, urgency, reversibilityWeight, impact, rank, warnings };
  });

  return scored.sort((a, b) => b.rank - a.rank);
}
