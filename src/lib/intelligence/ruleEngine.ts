// src/lib/intelligence/ruleEngine.ts
//
// Declarative rule evaluation. A Rule maps a feature vector (metrics/events
// already extracted by metricsIntelligence.ts) to a predicted probability
// that some domain outcome occurs, plus which conditions fired. Rules carry
// a calibratable `weight` (see ruleCalibration.ts / autoCalibrate.ts) that
// scales their contribution when multiple rules vote on the same subject.
export interface RuleCondition {
  feature: string;
  operator: "gt" | "gte" | "lt" | "lte" | "eq";
  threshold: number;
  /** probability contribution if this condition is true, in [0,1] */
  weight: number;
}

export interface Rule {
  id: string;
  domain: string;
  label: string;
  description: string;
  conditions: RuleCondition[];
  /** base rate used when no condition fires */
  baseProbability: number;
  /** calibratable multiplier applied to the rule's raw signal, see
   * ruleCalibration.ts. Starts at 1.0 (no adjustment). */
  weight: number;
}

export interface RuleFireResult {
  ruleId: string;
  label: string;
  firedConditions: RuleCondition[];
  rawProbability: number;
  calibratedProbability: number;
  features: Record<string, number>;
}

function evalCondition(cond: RuleCondition, value: number | undefined): boolean {
  if (value === undefined || Number.isNaN(value)) return false;
  switch (cond.operator) {
    case "gt":
      return value > cond.threshold;
    case "gte":
      return value >= cond.threshold;
    case "lt":
      return value < cond.threshold;
    case "lte":
      return value <= cond.threshold;
    case "eq":
      return value === cond.threshold;
  }
}

/** Evaluates a rule against a feature vector. Raw probability is the
 * base rate plus the sum of fired conditions' weights (clamped to [0,1]).
 * Calibrated probability additionally applies the rule's learned weight
 * multiplier around the 0.5 midpoint (logit-free linear recalibration is
 * sufficient at this scale and keeps the math auditable):
 *   calibrated = clamp(0.5 + (raw - 0.5) * weight, 0, 1)
 * A weight > 1 sharpens the rule's confidence; a weight < 1 softens an
 * overconfident rule, which is exactly what ruleCalibration.ts tunes. */
export function evaluateRule(rule: Rule, features: Record<string, number>): RuleFireResult {
  const fired = rule.conditions.filter((c) => evalCondition(c, features[c.feature]));
  const raw = Math.min(1, Math.max(0, rule.baseProbability + fired.reduce((sum, c) => sum + c.weight, 0)));
  const calibrated = Math.min(1, Math.max(0, 0.5 + (raw - 0.5) * rule.weight));
  return {
    ruleId: rule.id,
    label: rule.label,
    firedConditions: fired,
    rawProbability: raw,
    calibratedProbability: calibrated,
    features,
  };
}

export function evaluateRules(rules: Rule[], features: Record<string, number>): RuleFireResult[] {
  return rules.map((rule) => evaluateRule(rule, features));
}

/** Default rule library covering lead/account risk domains. Weights start
 * at 1.0; autoCalibrate.ts proposes adjustments from backtests. */
export const DEFAULT_RULES: Rule[] = [
  {
    id: "rule.deal.stalled",
    domain: "pipeline",
    label: "Deal stalled in stage",
    description: "No stage movement and declining engagement predicts slip.",
    baseProbability: 0.1,
    weight: 1,
    conditions: [
      { feature: "daysInStage", operator: "gt", threshold: 30, weight: 0.25 },
      { feature: "engagementTrend", operator: "lt", threshold: 0, weight: 0.2 },
      { feature: "emailResponseRateChange", operator: "lt", threshold: -0.2, weight: 0.15 },
    ],
  },
  {
    id: "rule.account.churnRisk",
    domain: "retention",
    label: "Account churn risk",
    description: "Usage decline plus unresolved support tickets predicts churn.",
    baseProbability: 0.08,
    weight: 1,
    conditions: [
      { feature: "usageTrend30d", operator: "lt", threshold: -0.15, weight: 0.3 },
      { feature: "openCriticalTickets", operator: "gte", threshold: 1, weight: 0.2 },
      { feature: "championTurnover", operator: "eq", threshold: 1, weight: 0.25 },
    ],
  },
  {
    id: "rule.forecast.slipRisk",
    domain: "forecast",
    label: "Quarterly forecast slip risk",
    description: "Pipeline coverage below target with late-stage concentration predicts a miss.",
    baseProbability: 0.12,
    weight: 1,
    conditions: [
      { feature: "pipelineCoverageRatio", operator: "lt", threshold: 3, weight: 0.3 },
      { feature: "lateStageConcentration", operator: "gt", threshold: 0.6, weight: 0.2 },
    ],
  },
];
