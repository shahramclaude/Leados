// Deterministic, rules-based lead scoring engine.
//
// This is intentionally NOT machine learning, causal inference, or an LLM.
// It is a transparent weighted-rule evaluator: every point on the score can
// be traced to exactly one rule and one signal value. See
// docs/explanations/intelligence-methodology.md for the honest rationale and
// limitations of this approach.

export type RuleOperator = "gte" | "lte" | "eq" | "truthy";

export interface ScoringRule {
  name: string;
  field: string;
  operator: RuleOperator;
  value: string;
  weight: number;
}

export type SignalValue = number | string | boolean;
export type Signals = Record<string, SignalValue>;

export interface ScoreBreakdownEntry {
  rule: string;
  field: string;
  matched: boolean;
  weight: number;
}

export interface ScoreResult {
  score: number;
  band: "hot" | "warm" | "cold";
  breakdown: ScoreBreakdownEntry[];
}

export const HOT_THRESHOLD = 70;
export const WARM_THRESHOLD = 40;

function coerceNumber(value: SignalValue | undefined): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return undefined;
}

export function evaluateRule(rule: ScoringRule, signals: Signals): boolean {
  const actual = signals[rule.field];

  switch (rule.operator) {
    case "truthy":
      return Boolean(actual);
    case "eq":
      return String(actual ?? "") === rule.value;
    case "gte": {
      const a = coerceNumber(actual);
      const b = coerceNumber(rule.value);
      return a !== undefined && b !== undefined && a >= b;
    }
    case "lte": {
      const a = coerceNumber(actual);
      const b = coerceNumber(rule.value);
      return a !== undefined && b !== undefined && a <= b;
    }
    default:
      return false;
  }
}

export function bandForScore(score: number): ScoreResult["band"] {
  if (score >= HOT_THRESHOLD) return "hot";
  if (score >= WARM_THRESHOLD) return "warm";
  return "cold";
}

/**
 * Scores a lead against an ordered list of active rules. The raw score is the
 * sum of weights of matched rules, clamped to [0, 100]. The breakdown lists
 * every rule evaluated (matched or not) so the caller can persist a full,
 * auditable evidence record.
 */
export function scoreLead(signals: Signals, rules: ScoringRule[]): ScoreResult {
  const breakdown: ScoreBreakdownEntry[] = rules.map((rule) => {
    const matched = evaluateRule(rule, signals);
    return {
      rule: rule.name,
      field: rule.field,
      matched,
      weight: matched ? rule.weight : 0,
    };
  });

  const rawScore = breakdown.reduce((sum, entry) => sum + entry.weight, 0);
  const score = Math.max(0, Math.min(100, rawScore));

  return { score, band: bandForScore(score), breakdown };
}
