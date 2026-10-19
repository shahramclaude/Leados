// src/lib/rulesEngine.ts
//
// BOOTSTRAP NOTE: referenced by the task's orchestrator stage order
// ("evaluateRules gets cascadeRisk.p added to severity weighting") but no
// prior rulesEngine.ts existed. Minimal original-derivation rule engine.

import type { LeadosEvent } from "./types";
import { countOfTypeInWindow } from "./eventUtils";
import { clamp01 } from "./temporal";

export interface RuleDefinition {
  id: string;
  description: string;
  baseSeverity: number; // 0-1, DESIGN PARAMETER per rule
  evaluate: (events: LeadosEvent[], now: Date) => boolean;
}

export interface EvaluatedRule {
  id: string;
  description: string;
  severity: number; // post cascade-risk weighting, 0-1
}

/** DESIGN PARAMETER: how strongly cascadeRisk.p amplifies rule severity. */
const CASCADE_SEVERITY_WEIGHT = 0.3;

const RULES: RuleDefinition[] = [
  {
    id: "overdue-action-items-spike",
    description: "Overdue action items spiked in the last 30 days.",
    baseSeverity: 0.5,
    evaluate: (events, now) => countOfTypeInWindow(events, "decision.action_item.overdue", now, 30) >= 5,
  },
  {
    id: "compliance-flags-raised",
    description: "Regulatory/compliance flags raised in the last 90 days.",
    baseSeverity: 0.7,
    evaluate: (events, now) => countOfTypeInWindow(events, "risk.compliance.flag", now, 90) > 0,
  },
  {
    id: "conflict-cluster",
    description: "Interpersonal conflict events clustering in the last 30 days.",
    baseSeverity: 0.45,
    evaluate: (events, now) => countOfTypeInWindow(events, "people.conflict.logged", now, 30) >= 3,
  },
];

/**
 * evaluateRules: runs each rule against the event stream, then applies
 * `cascadeRisk.p` as an additive weighting on top of each rule's base
 * severity (task spec: "evaluateRules gets cascadeRisk.p added to severity
 * weighting"). Weighting formula is a DESIGN PARAMETER (original
 * derivation): severity = clamp(base + cascadeRiskP * 0.3, 0, 1).
 */
export function evaluateRules(
  events: LeadosEvent[],
  now: Date,
  cascadeRiskP: number,
): EvaluatedRule[] {
  return RULES.filter((rule) => rule.evaluate(events, now)).map((rule) => ({
    id: rule.id,
    description: rule.description,
    severity: clamp01(rule.baseSeverity + cascadeRiskP * CASCADE_SEVERITY_WEIGHT),
  }));
}
