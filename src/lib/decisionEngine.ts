// decisionEngine.ts — the core decision-science logic: multi-criteria
// scoring, cognitive bias detection, Monte Carlo-powered counterfactuals,
// automatic post-mortems, and decision velocity analytics.

import type { Decision } from "@/db/schema";
import type { DecisionOption } from "./decisionTypes";
import { runSimulation, type SimInput, type SimResult } from "./monteCarlo";

// ---------------------------------------------------------------------------
// Multi-criteria option scoring
// ---------------------------------------------------------------------------

export interface CriterionWeight {
  criterion: "impact" | "reversibility" | "speed" | "cost" | "risk";
  weight: number;
  /** true if a HIGHER raw value is better (impact/reversibility/speed), false if lower is better (cost/risk) */
  higherIsBetter: boolean;
}

export const DEFAULT_CRITERIA_WEIGHTS: CriterionWeight[] = [
  { criterion: "impact", weight: 0.3, higherIsBetter: true },
  { criterion: "reversibility", weight: 0.2, higherIsBetter: true },
  { criterion: "speed", weight: 0.15, higherIsBetter: true },
  { criterion: "cost", weight: 0.15, higherIsBetter: false },
  { criterion: "risk", weight: 0.2, higherIsBetter: false },
];

export interface ScoreBreakdownEntry {
  criterion: string;
  weight: number;
  rawValue: number;
  normalizedValue: number;
  weightedContribution: number;
}

export interface ScoredOption {
  optionId: string;
  label: string;
  total: number;
  rank: number;
  breakdown: ScoreBreakdownEntry[];
}

export interface ScoringContext {
  weights?: CriterionWeight[];
}

/**
 * Score every option on a decision using weighted multi-criteria analysis.
 * Each criterion is normalized to 0-10 ("better" always maps to a higher
 * normalized value) before weights are applied, so the final 0-100 total is
 * directly comparable across options.
 */
export function scoreOptions(decision: Pick<Decision, "options">, context: ScoringContext = {}): ScoredOption[] {
  const weights = context.weights ?? DEFAULT_CRITERIA_WEIGHTS;
  const options = (decision.options ?? []) as DecisionOption[];

  const scored = options.map((option) => {
    const breakdown: ScoreBreakdownEntry[] = weights.map((w) => {
      const raw = clamp0to10(option[w.criterion] ?? 0);
      const normalized = w.higherIsBetter ? raw : 10 - raw;
      return {
        criterion: w.criterion,
        weight: w.weight,
        rawValue: raw,
        normalizedValue: normalized,
        weightedContribution: normalized * w.weight,
      };
    });
    const total = round2(breakdown.reduce((acc, b) => acc + b.weightedContribution, 0) * 10);
    return { optionId: option.id, label: option.label, total, breakdown, rank: 0 };
  });

  scored.sort((a, b) => b.total - a.total);
  scored.forEach((s, i) => (s.rank = i + 1));
  return scored;
}

function clamp0to10(value: number): number {
  return Math.min(10, Math.max(0, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Cognitive bias detection
// ---------------------------------------------------------------------------

export type BiasType = "anchoring" | "availability" | "sunk_cost" | "escalation_of_commitment";

export interface BiasFlag {
  type: BiasType;
  severity: "low" | "medium" | "high";
  message: string;
  evidence?: string;
}

const SUNK_COST_PATTERN =
  /(sunk cost|already (invested|spent|committed|put in)|too far (in|along) to (stop|turn back|pull out)|can'?t stop now|in too deep|we('| ha)ve come this far)/i;

const ESCALATION_PATTERN =
  /(double down|just need (a bit )?more (time|money|budget)|one more (push|try|quarter)|increase (the )?(investment|budget|spend)|throw more (resources|money) at)/i;

/**
 * Inspect a decision's option set and narrative text for classic decision
 * biases. Returns zero or more flags, each explaining the heuristic used.
 */
export function detectDecisionBiases(decision: Pick<Decision, "options" | "rationale" | "description" | "expectedOutcome">): BiasFlag[] {
  const flags: BiasFlag[] = [];
  const options = (decision.options ?? []) as DecisionOption[];
  const narrative = [decision.rationale, decision.description, decision.expectedOutcome].filter(Boolean).join(" \n ");

  // 1. Anchoring: only a single option was ever considered.
  if (options.length <= 1) {
    flags.push({
      type: "anchoring",
      severity: "high",
      message:
        "Only one option was considered. This is a classic anchoring risk — add at least one genuine alternative (including a 'do nothing' baseline) before committing.",
      evidence: options[0]?.label ? `Only option on record: "${options[0].label}"` : "No options recorded.",
    });
  }

  // 2. Availability bias: the most recently added option has a much longer
  // (>=2x) write-up than the average of the others, suggesting it is
  // over-weighted simply because it is freshest in mind.
  if (options.length >= 2) {
    const sorted = [...options].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const last = sorted[sorted.length - 1];
    const others = sorted.slice(0, -1);
    const avgOtherWords = others.reduce((acc, o) => acc + wordCount(o.description), 0) / others.length;
    const lastWords = wordCount(last.description);
    if (avgOtherWords > 0 && lastWords >= avgOtherWords * 2) {
      flags.push({
        type: "availability",
        severity: "medium",
        message: `The most recently added option ("${last.label}") has a write-up ${Math.round(
          lastWords / avgOtherWords,
        )}x longer than the average of the others. Recency/availability may be inflating its perceived merit — make sure it's winning on substance, not vividness.`,
        evidence: `${lastWords} words vs ${Math.round(avgOtherWords)} average`,
      });
    }
  }

  // 3. Sunk-cost language.
  const sunkMatch = narrative.match(SUNK_COST_PATTERN);
  if (sunkMatch) {
    flags.push({
      type: "sunk_cost",
      severity: "medium",
      message:
        "Language referencing prior investment was detected. Past costs are not recoverable and should not influence the forward-looking choice — evaluate options purely on future value.",
      evidence: `"...${sunkMatch[0]}..."`,
    });
  }

  // 4. Escalation of commitment language.
  const escalationMatch = narrative.match(ESCALATION_PATTERN);
  if (escalationMatch) {
    flags.push({
      type: "escalation_of_commitment",
      severity: "high",
      message:
        "Language suggesting further investment to rescue a struggling course of action was detected. Confirm this is justified by new evidence, not a desire to avoid admitting the original choice isn't working.",
      evidence: `"...${escalationMatch[0]}..."`,
    });
  }

  return flags;
}

function wordCount(text: string | undefined | null): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Counterfactuals (Monte Carlo powered)
// ---------------------------------------------------------------------------

export interface Counterfactual {
  optionId: string;
  label: string;
  isChosen: boolean;
  simulated: { p10: number; p50: number; p90: number; mean: number };
  narrative: string;
}

/**
 * Synthetic "value" function used to turn an option's qualitative sliders
 * into a single simulated outcome metric: impact gained minus cost paid
 * minus a risk penalty, each perturbed probabilistically.
 */
function optionValueAggregate(values: Record<string, number>): number {
  return (values.impact ?? 0) * 10 - (values.cost ?? 0) * 6 - (values.risk ?? 0) * 7;
}

function optionToSimInputs(option: DecisionOption): SimInput[] {
  return [
    { name: "impact", distribution: "triangular", min: Math.max(option.impact - 2, 0), mode: option.impact, max: Math.min(option.impact + 2, 10) },
    { name: "cost", distribution: "triangular", min: Math.max(option.cost - 1.5, 0), mode: option.cost, max: Math.min(option.cost + 1.5, 10) },
    { name: "risk", distribution: "normal", mean: option.risk, stdDev: Math.max(option.risk * 0.25, 0.5) },
  ];
}

/**
 * For decisions that have already been decided (or reversed), simulate what
 * might have happened under each alternative option using Monte Carlo, and
 * compare the distribution of outcomes against the option actually chosen.
 */
export function generateCounterfactuals(decision: Pick<Decision, "status" | "options" | "chosenOptionId">): Counterfactual[] {
  if (decision.status !== "decided" && decision.status !== "reversed") return [];
  const options = (decision.options ?? []) as DecisionOption[];
  if (options.length === 0) return [];

  const identity = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  return options.map((option) => {
    const result: SimResult = runSimulation(optionToSimInputs(option), identity, 4000, optionValueAggregate);
    const isChosen = option.id === decision.chosenOptionId;
    const narrative = isChosen
      ? `This is the option that was actually chosen. Simulated range of outcomes: ${result.p10.toFixed(1)} (p10) to ${result.p90.toFixed(
          1,
        )} (p90), median ${result.p50.toFixed(1)}.`
      : `Had "${option.label}" been chosen instead, simulated outcomes range from ${result.p10.toFixed(1)} (p10) to ${result.p90.toFixed(
          1,
        )} (p90), with a median of ${result.p50.toFixed(1)}.`;

    return {
      optionId: option.id,
      label: option.label,
      isChosen,
      simulated: { p10: result.p10, p50: result.p50, p90: result.p90, mean: result.mean },
      narrative,
    };
  });
}

// ---------------------------------------------------------------------------
// Automatic post-mortem
// ---------------------------------------------------------------------------

export interface OutcomeRecord {
  metric: string;
  expected: number;
  actual: number;
}

export interface PostMortem {
  decisionId: number;
  expectedVsActual: string;
  calibrationScore: number;
  outcomeScore: number | null;
  lessons: string[];
  biasRecap: BiasFlag[];
  metricDeltas: { metric: string; expected: number; actual: number; delta: number }[];
}

/**
 * Compare what was expected against what actually happened, score how
 * well-calibrated the original confidence was against the realized outcome,
 * and surface a short list of actionable lessons.
 */
export function autoPostMortem(
  decision: Pick<
    Decision,
    "id" | "options" | "rationale" | "description" | "expectedOutcome" | "actualOutcome" | "outcomeScore" | "confidenceAtDecision"
  >,
  outcomes: OutcomeRecord[] = [],
): PostMortem {
  const confidence01 = clamp01((decision.confidenceAtDecision ?? 50) / 100);
  const outcomeScore = decision.outcomeScore ?? null;
  const realizedSuccess01 = outcomeScore === null ? null : clamp01((outcomeScore + 1) / 2);

  // Calibration: 1.0 = confidence perfectly matched the realized outcome, 0 = maximally miscalibrated.
  const calibrationScore = realizedSuccess01 === null ? 0.5 : round2(1 - Math.abs(confidence01 - realizedSuccess01));

  const expectedVsActual =
    decision.expectedOutcome && decision.actualOutcome
      ? `Expected: "${decision.expectedOutcome}" — Actual: "${decision.actualOutcome}"`
      : decision.actualOutcome
        ? `Actual outcome recorded ("${decision.actualOutcome}") but no expected outcome was captured at decision time.`
        : "No actual outcome has been recorded yet.";

  const metricDeltas = outcomes.map((o) => ({
    metric: o.metric,
    expected: o.expected,
    actual: o.actual,
    delta: round2(o.actual - o.expected),
  }));

  const biasRecap = detectDecisionBiases(decision);

  const lessons: string[] = [];
  if (outcomeScore !== null && outcomeScore < 0) {
    lessons.push("Outcome underperformed expectations — revisit the scoring weights used for this domain before the next similar decision.");
  }
  if (outcomeScore !== null && outcomeScore > 0.5 && confidence01 < 0.5) {
    lessons.push("The outcome was strong despite low stated confidence — consider whether risk aversion is causing good options to be under-rated.");
  }
  if (calibrationScore < 0.6) {
    lessons.push("Confidence at decision time did not match the realized outcome. Recalibrate: track predicted vs. actual results for this domain going forward.");
  }
  if (biasRecap.length > 0) {
    lessons.push(`${biasRecap.length} bias signal(s) were present at decision time (${biasRecap.map((b) => b.type).join(", ")}) — review whether they affected the choice.`);
  }
  const missedMetrics = metricDeltas.filter((m) => Math.abs(m.delta) > Math.abs(m.expected) * 0.2);
  if (missedMetrics.length > 0) {
    lessons.push(`Largest miss: ${missedMetrics.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0].metric} deviated most from plan.`);
  }
  if (lessons.length === 0) {
    lessons.push("No major issues detected — this decision's confidence, process, and outcome were reasonably well aligned.");
  }

  return {
    decisionId: decision.id,
    expectedVsActual,
    calibrationScore,
    outcomeScore,
    lessons,
    biasRecap,
    metricDeltas,
  };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

// ---------------------------------------------------------------------------
// Decision velocity
// ---------------------------------------------------------------------------

export interface VelocityMetrics {
  avgDaysOpen: number;
  stalledCount: number;
  overdueCount: number;
  resolvedLast30d: number;
  velocityTrend: "improving" | "declining" | "steady";
}

const DAY_MS = 24 * 60 * 60 * 1000;
const STALLED_THRESHOLD_DAYS = 14;

export function computeDecisionVelocity(
  decisions: Pick<Decision, "status" | "createdAt" | "decidedAt" | "deadline">[],
  today: Date = new Date(),
): VelocityMetrics {
  const openDecisions = decisions.filter((d) => d.status === "open");

  const ages = openDecisions.map((d) => daysBetween(new Date(d.createdAt), today));
  const avgDaysOpen = ages.length > 0 ? round2(ages.reduce((a, b) => a + b, 0) / ages.length) : 0;

  const stalledCount = ages.filter((age) => age > STALLED_THRESHOLD_DAYS).length;

  const overdueCount = openDecisions.filter((d) => d.deadline && new Date(d.deadline) < today).length;

  const resolved = decisions.filter((d) => (d.status === "decided" || d.status === "reversed") && d.decidedAt);

  const last30Start = new Date(today.getTime() - 30 * DAY_MS);
  const prev30Start = new Date(today.getTime() - 60 * DAY_MS);

  const resolvedLast30d = resolved.filter((d) => new Date(d.decidedAt as Date) >= last30Start && new Date(d.decidedAt as Date) <= today).length;
  const resolvedPrev30d = resolved.filter((d) => new Date(d.decidedAt as Date) >= prev30Start && new Date(d.decidedAt as Date) < last30Start).length;

  let velocityTrend: VelocityMetrics["velocityTrend"] = "steady";
  if (resolvedLast30d > resolvedPrev30d) velocityTrend = "improving";
  else if (resolvedLast30d < resolvedPrev30d) velocityTrend = "declining";

  return { avgDaysOpen, stalledCount, overdueCount, resolvedLast30d, velocityTrend };
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / DAY_MS));
}
