/**
 * ruleTypes.ts — pure rule-evaluation logic shared by the single canonical
 * rule engine (`src/lib/platform/intelligence/ruleEngine.ts`). Kept in the
 * domain layer because it has zero I/O: given a rule definition and an
 * input record, it returns a probability + evidence, nothing else.
 */

import { logOddsPool, type LogOddsEvidenceItem } from "./bayesian";
import type { EvidenceRef } from "./types";

export type RuleInput = Record<string, number | string | boolean>;

export type RuleEvalResult = {
  p: number; // this rule's standalone probability estimate, in [0,1]
  evidence: EvidenceRef[];
  firedFeatures: string[];
};

export type Rule = {
  id: string;
  domain: string;
  ruleClass: string; // grouping used by autoCalibrate's human-approval toggle
  description: string;
  correlationGroup?: string;
  /** current weight (source reliability analogue for a rule), [0.25, 1],
   * adjusted only by `autoCalibrate.ts` within guardrails. */
  weight: number;
  evaluate: (input: RuleInput) => RuleEvalResult;
};

/** Fuse multiple rules' standalone probabilities into one posterior using
 * the same log-odds pooling primitive as belief updating (Part 04-A) — one
 * mathematical mechanism for combining independent-ish probabilistic
 * evidence, reused rather than reinvented for rules. This is precisely the
 * de-duplication the standing order requires for the rule-engine cluster:
 * every former "scoring path" now reduces to a weighted log-odds pool. */
export function fuseRules(
  priorP: number,
  rules: Rule[],
  input: RuleInput,
): { posteriorP: number; perRule: { rule: Rule; result: RuleEvalResult; weightApplied: number }[] } {
  const evaluated = rules.map((rule) => ({ rule, result: rule.evaluate(input) }));
  const items: LogOddsEvidenceItem[] = evaluated.map(({ rule, result }) => ({
    evidence: {
      id: `rule:${rule.id}:${Date.now()}`,
      kind: "metric" as const,
      sourceId: `rule:${rule.id}`,
      correlationGroup: rule.correlationGroup,
      weightApplied: rule.weight,
      observedAt: new Date().toISOString(),
      description: rule.description,
    },
    p: result.p,
    reliability: rule.weight,
  }));
  const { posteriorP, perItemWeight } = logOddsPool(priorP, items);
  const perRule = evaluated.map(({ rule, result }, i) => ({
    rule,
    result,
    weightApplied: perItemWeight[items[i].evidence.id] ?? 0,
  }));
  return { posteriorP, perRule };
}
