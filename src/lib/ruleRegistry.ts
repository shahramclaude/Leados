// src/lib/ruleRegistry.ts
//
// Canonical catalog of detection rules. Each rule reads from the belief
// fabric's posteriors (primarily) to decide whether it "fires". This is the
// single source of truth for rule logic — ruleEngine.ts evaluates these
// definitions against live data; ruleStore.ts persists/loads their
// calibrated weights.

import type { LatentNodeId, RuleDefinition } from "./types";

function thresholdRule(
  key: string,
  name: string,
  domain: RuleDefinition["domain"],
  baseSeverity: number,
  node: LatentNodeId,
  threshold: number,
): RuleDefinition {
  return {
    key,
    name,
    domain,
    baseSeverity,
    evaluate: (ctx) => {
      const marginal = ctx.beliefs.posteriors[node];
      return {
        fired: marginal.p >= threshold,
        probability: marginal.p,
        detail: `${String(node)} posterior p=${marginal.p.toFixed(2)} (threshold ${threshold})`,
      };
    },
  };
}

export const RULE_DEFINITIONS: RuleDefinition[] = [
  thresholdRule("FLIGHT_RISK_ELEVATED", "Flight risk elevated", "people", 3, "flightRisk", 0.55),
  thresholdRule("FLIGHT_RISK_CRITICAL", "Flight risk critical", "people", 4, "flightRisk", 0.75),
  thresholdRule("BURNOUT_RISK_ELEVATED", "Burnout risk elevated", "people", 3, "burnoutRisk", 0.55),
  thresholdRule("BURNOUT_RISK_CRITICAL", "Burnout risk critical", "people", 4, "burnoutRisk", 0.75),
  thresholdRule("EXECUTION_RISK_ELEVATED", "Execution risk elevated", "execution", 3, "executionRisk", 0.55),
  thresholdRule("EXECUTION_RISK_CRITICAL", "Execution risk critical", "execution", 4, "executionRisk", 0.75),
  thresholdRule("CULTURE_RISK_ELEVATED", "Culture risk elevated", "culture", 3, "cultureRisk", 0.55),
  thresholdRule("CULTURE_RISK_CRITICAL", "Culture risk critical", "culture", 4, "cultureRisk", 0.75),
  thresholdRule("FINANCIAL_RISK_ELEVATED", "Financial risk elevated", "finance", 3, "financialRisk", 0.55),
  thresholdRule("FINANCIAL_RISK_CRITICAL", "Financial risk critical", "finance", 4, "financialRisk", 0.75),
  thresholdRule("INNOVATION_STALL_ELEVATED", "Innovation stall elevated", "innovation", 3, "innovationStall", 0.55),
  thresholdRule("DECISION_PARALYSIS_ELEVATED", "Decision paralysis elevated", "strategy", 3, "decisionParalysis", 0.55),
  thresholdRule("STRATEGY_RISK_ELEVATED", "Strategy risk elevated", "strategy", 3, "strategyRisk", 0.55),
  thresholdRule(
    "LEADERSHIP_ENERGY_DEPLETION_ELEVATED",
    "Leadership energy depletion elevated",
    "people",
    3,
    "leadershipEnergyDepletion",
    0.55,
  ),
  thresholdRule("CASCADE_RISK_CRITICAL", "Cascade risk critical", "strategy", 5, "cascadeRisk", 0.6),
];

export function getRuleDefinition(key: string): RuleDefinition | undefined {
  return RULE_DEFINITIONS.find((r) => r.key === key);
}

export function allRuleDefinitions(): RuleDefinition[] {
  return RULE_DEFINITIONS;
}
