// Static registry of rule *definitions*. These describe the shape and
// starting weight of every rule the orchestrator can evaluate. Live,
// self-calibrated weights are persisted in the `rules` table (see
// ruleStore.ts) and drift away from `baseWeight` over time via
// selfImprove.ts — the registry below is only the seed/reset source of
// truth, it is never mutated at runtime.

export type RuleCategory = "flight_risk" | "domain_health" | "causal_chain";

export interface RuleDefinition {
  key: string;
  name: string;
  description: string;
  category: RuleCategory;
  baseWeight: number;
}

export const RULE_REGISTRY: RuleDefinition[] = [
  {
    key: "FLIGHT_RISK_THRESHOLD",
    name: "Flight risk threshold",
    description:
      "Flags a person as a retention risk when their flight risk score exceeds 0.6.",
    category: "flight_risk",
    baseWeight: 1.0,
  },
  {
    key: "DOMAIN_HEALTH_DROP",
    name: "Domain health regression",
    description:
      "Flags a domain whose health score has dropped more than 15 points versus the prior run.",
    category: "domain_health",
    baseWeight: 1.0,
  },
  {
    key: "CAUSAL_CHAIN_CONFIDENCE",
    name: "Causal chain confidence",
    description:
      "Flags causal chains between domains whose inferred confidence exceeds 0.7.",
    category: "causal_chain",
    baseWeight: 1.0,
  },
  {
    key: "METRIC_ANOMALY_ZSCORE",
    name: "Metric anomaly (z-score)",
    description:
      "Flags a metric reading as anomalous when its z-score versus trailing history exceeds 2.5.",
    category: "domain_health",
    baseWeight: 1.0,
  },
];

export function getRuleDefinition(key: string): RuleDefinition | undefined {
  return RULE_REGISTRY.find((rule) => rule.key === key);
}
