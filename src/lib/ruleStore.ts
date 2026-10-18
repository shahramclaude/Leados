// ════════════════════════════════════════════════════════════════════
// In-memory rule store. This is the single source of truth the API route
// handlers (src/app/api/rules/route.ts) and the Signal Board UI operate
// on. In a deployed Next.js app this would be a database-backed
// repository; the interface is kept identical so swapping in persistence
// later is a drop-in change.
// ════════════════════════════════════════════════════════════════════
import { RULE_CATALOG, Rule, cloneRule, RuleContext, metric, daysSince, countInWindow } from "./ruleRegistry";
import { generateHistoricalOutcomes } from "./mockOrgData";
import { runCalibrationPass, calibrateRule, CalibrationDiffEntry, Outcome } from "./autoCalibrate";
import { buildOrgDataset, metricFullSeries } from "./mockOrgData";

let rules: Rule[] = RULE_CATALOG.map(cloneRule);
let outcomes: Outcome[] = generateHistoricalOutcomes(rules);
let lastCalibrationDiff: CalibrationDiffEntry[] = [];

export function listRules(): Rule[] {
  return rules;
}

export function getRule(id: string): Rule | undefined {
  return rules.find((r) => r.id === id);
}

export function addFalsePositiveOutcome(ruleId: string): void {
  outcomes.push({ ruleId, firedAt: new Date(), confirmedProblem: false });
}

export function addConfirmedOutcome(ruleId: string): void {
  outcomes.push({ ruleId, firedAt: new Date(), confirmedProblem: true });
}

/** "Mark as false positive" feeds the calibration engine immediately: the
 * outcome is recorded and that single rule is re-weighted right away so the
 * analyst sees the effect of their feedback without waiting for a full pass. */
export function recordFalsePositiveAndRecalibrate(ruleId: string): Rule | undefined {
  addFalsePositiveOutcome(ruleId);
  const idx = rules.findIndex((r) => r.id === ruleId);
  if (idx === -1) return undefined;
  const freshOutcome: Outcome = { ruleId, firedAt: new Date(), confirmedProblem: false };
  const updated = calibrateRule(rules[idx], [freshOutcome]);
  rules[idx] = updated;
  return updated;
}

export function patchRule(id: string, patch: Partial<Pick<Rule, "enabled" | "weight">>): Rule | undefined {
  const idx = rules.findIndex((r) => r.id === id);
  if (idx === -1) return undefined;
  rules[idx] = { ...rules[idx], ...patch };
  return rules[idx];
}

export interface CustomRuleInput {
  name: string;
  domain: Rule["domain"];
  condition_expression: string;
  severity: Rule["severity"];
  tags: string[];
}

// ─────────────────────────── Safe DSL ───────────────────────────
// Grammar (ANDed terms only — intentionally small surface area):
//   expr       := term ('&&' term)*
//   term       := call op NUMBER
//   call       := "metric(" STRING ")" | "daysSince(" STRING ")" | "countInWindow(" STRING "," NUMBER ")"
//   op         := ">" | ">=" | "<" | "<=" | "=="
// No identifiers, no arbitrary JS, no eval() — purely hand-parsed.

const CALL_RE =
  /^(metric|daysSince|countInWindow)\(\s*'([^']+)'\s*(?:,\s*(\d+(?:\.\d+)?)\s*)?\)\s*(>=|<=|==|>|<)\s*(-?\d+(?:\.\d+)?)$/;

export interface CompiledExpression {
  evaluate: (ctx: RuleContext) => boolean;
  describe: string;
}

export function validateAndCompileExpression(expression: string): CompiledExpression {
  const raw = expression.trim();
  if (!raw) throw new Error("Expression cannot be empty.");
  if (raw.length > 400) throw new Error("Expression too long.");
  // Disallow anything resembling arbitrary JS before we even try to parse terms.
  if (/[;{}`]|=>|function|while|for\s*\(|import|require/.test(raw)) {
    throw new Error("Expression contains disallowed syntax.");
  }

  const terms = raw.split("&&").map((t) => t.trim());
  if (terms.length === 0) throw new Error("No valid terms found.");

  const compiledTerms: Array<(ctx: RuleContext) => boolean> = [];
  for (const term of terms) {
    const m = term.match(CALL_RE);
    if (!m) {
      throw new Error(
        `Invalid term "${term}". Allowed forms: metric('key') > 5, daysSince('event_type') > 10, countInWindow('event_type', 30) >= 2`
      );
    }
    const [, fn, arg1, arg2, op, numStr] = m;
    const num = parseFloat(numStr);
    const cmp = (v: number | undefined): boolean => {
      if (v === undefined) return false;
      switch (op) {
        case ">": return v > num;
        case ">=": return v >= num;
        case "<": return v < num;
        case "<=": return v <= num;
        case "==": return v === num;
        default: return false;
      }
    };
    if (fn === "metric") {
      compiledTerms.push((ctx) => cmp(metric(ctx, arg1)));
    } else if (fn === "daysSince") {
      compiledTerms.push((ctx) => cmp(daysSince(ctx, arg1)));
    } else if (fn === "countInWindow") {
      if (arg2 === undefined) throw new Error("countInWindow requires a days argument, e.g. countInWindow('event', 30) > 2");
      const windowDays = parseFloat(arg2);
      compiledTerms.push((ctx) => cmp(countInWindow(ctx, arg1, windowDays)));
    }
  }

  return {
    evaluate: (ctx) => compiledTerms.every((fn) => fn(ctx)),
    describe: raw,
  };
}

export function createCustomRule(input: CustomRuleInput): Rule {
  const compiled = validateAndCompileExpression(input.condition_expression);
  const id = `CUSTOM-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const rule: Rule = {
    id,
    name: input.name,
    domain: input.domain,
    description: `Custom rule: ${compiled.describe}`,
    severity: input.severity,
    weight: input.severity,
    calibration: { truePositiveCount: 0, falsePositiveCount: 0, lastCalibrated: new Date() },
    autoThresholds: {},
    enabled: true,
    tags: input.tags,
    suggestedAction: "Review the triggering evidence and decide on next steps.",
    condition: compiled.evaluate,
    evidence: () => `Custom expression matched: ${compiled.describe}`,
    dataRefs: { metrics: [], events: [] },
    isCustom: true,
  };
  rules = [...rules, rule];
  return rule;
}

export interface ExpressionPreview {
  valid: boolean;
  error: string | null;
  fireCount: number;
  windowDays: number;
}

/** Powers the Rule Builder drawer's "this would have fired N times in the
 * last 30 days" live preview. Re-uses the exact same server-side validator
 * the POST /api/rules endpoint uses, so preview and real validation never
 * disagree. */
export function previewExpression(expression: string, windowDays = 30): ExpressionPreview {
  try {
    const compiled = validateAndCompileExpression(expression);
    const dataset = buildOrgDataset(rules);
    let fireCount = 0;
    for (let d = windowDays - 1; d >= 0; d--) {
      const ctx = { now: Date.now() - d * 86_400_000, metricHistory: dataset.metricHistory, events: dataset.events };
      if (compiled.evaluate(ctx)) fireCount++;
    }
    return { valid: true, error: null, fireCount, windowDays };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : "Invalid expression.", fireCount: 0, windowDays };
  }
}

export function runFullCalibration(): CalibrationDiffEntry[] {
  const dataset = buildOrgDataset(rules);
  const allMetricKeys = new Set<string>();
  for (const r of rules) for (const m of r.dataRefs.metrics) allMetricKeys.add(m.key);
  const seriesByKey: Record<string, number[]> = {};
  for (const key of allMetricKeys) seriesByKey[key] = metricFullSeries(rules, key);
  void dataset;

  const diff = runCalibrationPass(rules, outcomes, seriesByKey, 0.75);
  rules = diff.map((d) => d.updatedRule);
  lastCalibrationDiff = diff;
  return diff;
}

export function getLastCalibrationDiff(): CalibrationDiffEntry[] {
  return lastCalibrationDiff;
}

export function getOutcomes(): Outcome[] {
  return outcomes;
}

export function resetStore(): void {
  rules = RULE_CATALOG.map(cloneRule);
  outcomes = generateHistoricalOutcomes(rules);
  lastCalibrationDiff = [];
}
